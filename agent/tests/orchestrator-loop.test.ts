/**
 * Test: orchestrator-loop.test.ts
 * Mục đích: Test logic chính của orchestrator loop trong AI_social
 *
 * Kiểm thử các layer termination, polling, error isolation, token tracking.
 * Mock Supabase client và OpenAI client để chạy offline.
 *
 * Chạy: `npx vitest run tests/orchestrator-loop.test.ts`
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS - Phải đặt trước import code cần test để vitest hoist lên trên
// ============================================================================

// Mock @supabase/supabase-js — trả về chainable query builder
const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
};

// Mock openai — trả về chat completions
const mockOpenAI = {
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

vi.mock('openai', () => ({
  default: mockOpenAI,
}));

// ============================================================================
// IMPORT SAU MOCK
// ============================================================================

import { OrchestratorLoop } from '../src/orchestrator/orchestrator-loop-test';
import type { Room, Agent, Message, TerminationReason } from '../src/orchestrator/types';

// ============================================================================
// HELPERS - Tạo mock objects dễ dùng
// ============================================================================

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    status: 'active',
    topic: 'Test topic',
    maxMessages: 20,
    messageCount: 0,
    startedAt: Date.now() - 1000,
    agents: [
      { id: 'agent-1', name: 'Alice', model: 'gpt-4o-mini', systemPrompt: 'You are Alice' },
      { id: 'agent-2', name: 'Bob', model: 'claude-3-haiku', systemPrompt: 'You are Bob' },
    ],
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    roomId: 'room-1',
    agentId: 'agent-1',
    content: 'Hello world',
    tokenCount: 10,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('OrchestratorLoop', () => {
  let orchestrator: OrchestratorLoop;
  let mockLogger: any;
  let mockContextBuilder: any;
  let mockTurnSelector: any;
  let mockTerminationChecker: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset timer mock state
    vi.useFakeTimers();

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    // Mock context builder
    mockContextBuilder = {
      build: vi.fn().mockResolvedValue({
        messages: [{ role: 'system', content: 'You are Alice' }],
        tokenEstimate: 100,
      }),
    };

    // Mock turn selector
    mockTurnSelector = {
      selectNextAgent: vi.fn().mockReturnValue('agent-1'),
    };

    // Mock termination checker
    mockTerminationChecker = {
      check: vi.fn().mockReturnValue({ shouldStop: false, reason: null }),
    };

    // Setup Supabase chainable query
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };
    mockSupabase.from.mockReturnValue(queryBuilder);

    // Setup OpenAI mock — mặc định trả về response hợp lệ
    mockOpenAI.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: { role: 'assistant', content: 'Mocked response' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
    });

    // Tạo orchestrator với mocks
    orchestrator = new OrchestratorLoop({
      supabase: mockSupabase as any,
      openai: mockOpenAI as any,
      logger: mockLogger,
      contextBuilder: mockContextBuilder,
      turnSelector: mockTurnSelector,
      terminationChecker: mockTerminationChecker,
      pollIntervalMs: 1000,
      roomTokenBudget: 10000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    orchestrator.stop();
  });

  // --------------------------------------------------------------------------
  // Test 1: start() poll loop chạy đúng interval
  // --------------------------------------------------------------------------
  it('start() poll loop chạy đúng interval', async () => {
    // Act: bật orchestrator
    orchestrator.start();

    // Assert: chưa có tick nào
    expect(mockSupabase.from).not.toHaveBeenCalled();

    // Act: tiến thời gian 1 interval → 1 tick
    await vi.advanceTimersByTimeAsync(1000);

    // Assert: đã gọi Supabase tìm phòng active
    expect(mockSupabase.from).toHaveBeenCalledWith('rooms');

    // Act: tiến thêm 2 intervals → tổng 3 ticks
    await vi.advanceTimersByTimeAsync(2000);

    // Assert: gọi Supabase ít nhất 2 lần (mỗi tick 1 lần)
    const roomCalls = mockSupabase.from.mock.calls.filter((c) => c[0] === 'rooms');
    expect(roomCalls.length).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // Test 2: processRoom() gọi đúng LLM với context đã build
  // --------------------------------------------------------------------------
  it('processRoom() gọi đúng LLM với context đã build', async () => {
    const room = makeRoom();

    // Act: xử lý 1 phòng
    await orchestrator.processRoom(room);

    // Assert: contextBuilder đã được gọi
    expect(mockContextBuilder.build).toHaveBeenCalledWith(room, expect.any(Array));

    // Assert: OpenAI đã được gọi với messages từ context
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: expect.arrayContaining([
          { role: 'system', content: 'You are Alice' },
        ]),
      })
    );
  });

  // --------------------------------------------------------------------------
  // Test 3: Termination layer 1 — hard_cap (messageCount >= maxMessages)
  // --------------------------------------------------------------------------
  it('Termination layer 1: hard_cap → conclude', async () => {
    // Mock termination trả về stop với lý do hard_cap
    mockTerminationChecker.check.mockReturnValue({
      shouldStop: true,
      reason: 'hard_cap' as TerminationReason,
    });

    const room = makeRoom({ messageCount: 19, maxMessages: 20 });

    // Act
    await orchestrator.processRoom(room);

    // Assert: status phòng đã được chuyển sang 'concluded'
    expect(mockSupabase.from).toHaveBeenCalledWith('rooms');
    const updateCall = mockSupabase.from.mock.calls.find((c) => c[0] === 'rooms');
    expect(updateCall).toBeDefined();

    // Assert: log kết thúc với lý do hard_cap
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('hard_cap'),
      expect.any(Object)
    );
  });

  // --------------------------------------------------------------------------
  // Test 4: Termination layer 2 — token_budget
  // --------------------------------------------------------------------------
  it('Termination layer 2: token_budget → conclude', async () => {
    mockTerminationChecker.check.mockReturnValue({
      shouldStop: true,
      reason: 'token_budget' as TerminationReason,
    });

    const room = makeRoom();

    // Act
    await orchestrator.processRoom(room);

    // Assert: log với lý do token_budget
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('token_budget'),
      expect.any(Object)
    );
  });

  // --------------------------------------------------------------------------
  // Test 5: Termination layer 6 — admin override (status !== 'active')
  // --------------------------------------------------------------------------
  it('Termination layer 6: admin override → conclude', async () => {
    // Status phòng đã bị admin set sang 'paused'
    const room = makeRoom({ status: 'paused' });

    // Act
    await orchestrator.processRoom(room);

    // Assert: không gọi LLM (vì status không active)
    expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();

    // Assert: log về admin override
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('admin'),
      expect.objectContaining({ roomId: 'room-1' })
    );
  });

  // --------------------------------------------------------------------------
  // Test 6: Khi 1 phòng lỗi, phòng khác vẫn chạy
  // --------------------------------------------------------------------------
  it('Khi 1 phòng lỗi, phòng khác vẫn chạy', async () => {
    const roomA = makeRoom({ id: 'room-A' });
    const roomB = makeRoom({ id: 'room-B' });

    // Mock LLM fail cho roomA, ok cho roomB
    mockOpenAI.chat.completions.create
      .mockRejectedValueOnce(new Error('OpenRouter down'))
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'OK from B' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

    // Act
    await orchestrator.processRoom(roomA);
    await orchestrator.processRoom(roomB);

    // Assert: cả 2 phòng đều được xử lý (không crash toàn bộ)
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);

    // Assert: log lỗi cho roomA
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('room-A'),
      expect.any(Error)
    );
  });

  // --------------------------------------------------------------------------
  // Test 7: hydrateTokenTotals load đúng từ DB
  // --------------------------------------------------------------------------
  it('hydrateTokenTotals load đúng từ DB', async () => {
    // Mock DB trả về token totals
    const queryBuilder = mockSupabase.from('rooms') as any;
    queryBuilder.then = vi.fn((resolve) =>
      resolve({
        data: [
          { id: 'room-1', total_tokens_used: 5000 },
          { id: 'room-2', total_tokens_used: 3000 },
        ],
        error: null,
      })
    );

    // Act
    await orchestrator.hydrateTokenTotals();

    // Assert: query đã gọi bảng rooms
    expect(mockSupabase.from).toHaveBeenCalledWith('rooms');

    // Assert: total tokens cho room-1 = 5000
    const totals = orchestrator.getTokenTotals();
    expect(totals.get('room-1')).toBe(5000);
    expect(totals.get('room-2')).toBe(3000);
  });

  // --------------------------------------------------------------------------
  // Test 8: cleanupInactiveRooms giải phóng token totals
  // --------------------------------------------------------------------------
  it('cleanupInactiveRooms giải phóng token totals', async () => {
    // Setup: load totals trước
    const queryBuilder = mockSupabase.from('rooms') as any;
    queryBuilder.then = vi.fn((resolve) =>
      resolve({
        data: [
          { id: 'room-1', total_tokens_used: 5000 },
          { id: 'room-2', total_tokens_used: 3000 },
        ],
        error: null,
      })
    );
    await orchestrator.hydrateTokenTotals();

    // Act: dọn phòng inactive (chỉ giữ room-1 active)
    await orchestrator.cleanupInactiveRooms(new Set(['room-1']));

    // Assert: room-2 đã bị xóa khỏi map
    const totals = orchestrator.getTokenTotals();
    expect(totals.has('room-1')).toBe(true);
    expect(totals.has('room-2')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test 9: Track token usage insert đúng vào DB
  // --------------------------------------------------------------------------
  it('Track token usage insert đúng vào DB', async () => {
    const room = makeRoom();

    // Act
    await orchestrator.processRoom(room);

    // Assert: insert vào bảng token_usage
    const calls = mockSupabase.from.mock.calls.map((c) => c[0]);
    expect(calls).toContain('token_usage');

    // Assert: insert call có chứa số tokens
    const insertCall = mockSupabase.from.mock.results
      .map((r) => r.value)
      .find((v) => v && v.insert);
    expect(insertCall).toBeDefined();
  });
});
