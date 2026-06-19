/**
 * Test: turn-selector.test.ts
 * Mục đích: Test thuật toán chọn lượt nói cho agent kế tiếp trong phòng
 *
 * Thuật toán: score = topic*0.3 + recency*0.3 + talk*0.2 + noise*0.2
 * - topic: mức độ liên quan đến chủ đề phòng (0-1)
 * - recency: 1 nếu chưa nói gần đây, giảm dần theo thời gian
 * - talk: ưu tiên agent chưa nói nhiều (nghịch của số lượt đã nói)
 * - noise: ưu tiên agent "yên lặng" (nghịch của tần suất nói gần đây)
 *
 * Chạy: `npx vitest run tests/turn-selector.test.ts`
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TurnSelector } from '../src/orchestrator/turn-selector-class';
import type { Agent, Message } from '../src/orchestrator/types';

// ============================================================================
// HELPERS
// ============================================================================

function makeAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    name: `Agent-${id}`,
    model: 'gpt-4o-mini',
    systemPrompt: `I am ${id}`,
    ...overrides,
  };
}

function makeMessage(agentId: string, content: string, createdAt: number): Message {
  return {
    id: `msg-${createdAt}-${agentId}`,
    roomId: 'room-1',
    agentId,
    content,
    tokenCount: 10,
    createdAt,
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('TurnSelector.selectNextAgent', () => {
  let selector: TurnSelector;

  beforeEach(() => {
    selector = new TurnSelector();
  });

  // --------------------------------------------------------------------------
  // Test 1: room.agents rỗng → trả về null
  // --------------------------------------------------------------------------
  it('room.agents rỗng → null', () => {
    const result = selector.selectNextAgent({
      room: { id: 'room-1', topic: 'test', agents: [] } as any,
      recentMessages: [],
    });

    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Test 2: recentMessages rỗng → random pick
  // --------------------------------------------------------------------------
  it('recentMessages rỗng → random pick từ agents', () => {
    const agents = [makeAgent('a1'), makeAgent('a2'), makeAgent('a3')];

    // Act: chạy 50 lần để xác nhận phân phối
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = selector.selectNextAgent({
        room: { id: 'room-1', topic: 'test', agents } as any,
        recentMessages: [],
      });
      if (result) picks.add(result);
    }

    // Assert: phải có ít nhất 2 agent khác nhau được chọn (random)
    expect(picks.size).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // Test 3: Last speaker bị loại trừ
  // --------------------------------------------------------------------------
  it('Last speaker bị loại trừ khỏi lượt tiếp theo', () => {
    const agents = [makeAgent('a1'), makeAgent('a2'), makeAgent('a3')];
    const now = Date.now();
    const recentMessages = [
      makeMessage('a1', 'Last message from a1', now - 1000),
    ];

    // Act: chạy nhiều lần
    for (let i = 0; i < 20; i++) {
      const result = selector.selectNextAgent({
        room: { id: 'room-1', topic: 'test', agents } as any,
        recentMessages,
      });
      // Assert: KHÔNG bao giờ chọn a1 (last speaker)
      expect(result).not.toBe('a1');
    }
  });

  // --------------------------------------------------------------------------
  // Test 4: Score formula đúng
  // --------------------------------------------------------------------------
  it('Score formula = topic*0.3 + recency*0.3 + talk*0.2 + noise*0.2', () => {
    // Spy vào internal scoring
    const scoreSpy = vi.spyOn(selector as any, 'computeScore');

    const agents = [makeAgent('a1'), makeAgent('a2')];
    const now = Date.now();
    const recentMessages = [
      makeMessage('a2', 'old message', now - 60000), // 1 phút trước
    ];

    selector.selectNextAgent({
      room: { id: 'room-1', topic: 'test', agents } as any,
      recentMessages,
    });

    // Assert: computeScore được gọi cho từng agent
    expect(scoreSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      expect.any(Object)
    );
    expect(scoreSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a2' }),
      expect.any(Object)
    );

    // Assert: trọng số đúng
    // score cho a1 (chưa nói): recency=1, talk=1, noise=1 → score cao
    // score cho a2 (vừa nói): recency thấp, talk thấp → score thấp
    const a1Score = (selector as any).computeScore(
      agents[0],
      {
        room: { topic: 'test' } as any,
        recentMessages,
        totalMessagesByAgent: new Map([['a2', 1]]),
      }
    );

    // Tính tay: topic (giả định 0.5) * 0.3 + 1 * 0.3 + 1 * 0.2 + 1 * 0.2
    // = 0.15 + 0.3 + 0.2 + 0.2 = 0.85
    expect(a1Score).toBeGreaterThan(0.8);
    expect(a1Score).toBeLessThanOrEqual(1.0);
  });

  // --------------------------------------------------------------------------
  // Test 5: Agent chưa từng nói → recency = 1
  // --------------------------------------------------------------------------
  it('Agent chưa từng nói → recency = 1 (cao nhất)', () => {
    const agents = [makeAgent('newbie')];

    const score = (selector as any).computeScore(
      agents[0],
      {
        room: { topic: 'test' } as any,
        recentMessages: [], // chưa từng có message
        totalMessagesByAgent: new Map(), // chưa từng nói
      }
    );

    // recency = 1.0 → đóng góp 0.3 vào tổng score
    // topic (giả định 0.5) * 0.3 + 1 * 0.3 + 1 * 0.2 + 1 * 0.2 = 0.85
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  // --------------------------------------------------------------------------
  // Test 6: Tất cả agents đã nói gần nhất → chọn theo score cao nhất
  // --------------------------------------------------------------------------
  it('Tất cả agents đã nói → chọn theo score cao nhất (deterministic)', () => {
    const agents = [makeAgent('a1'), makeAgent('a2'), makeAgent('a3')];
    const now = Date.now();

    // a1 nói rất cũ, a2 nói gần nhất, a3 nói trung bình
    const recentMessages = [
      makeMessage('a1', 'very old', now - 300000), // 5 phút trước
      makeMessage('a3', 'medium', now - 120000), // 2 phút trước
      makeMessage('a2', 'recent', now - 10000), // 10 giây trước
    ];

    // Act
    const result = selector.selectNextAgent({
      room: { id: 'room-1', topic: 'test', agents } as any,
      recentMessages,
    });

    // Assert: a1 có recency cao nhất (lâu chưa nói) → được chọn
    expect(result).toBe('a1');
  });

  // --------------------------------------------------------------------------
  // Test 7: Agent với topic liên quan cao được ưu tiên
  // --------------------------------------------------------------------------
  it('Agent có topic relevance cao được ưu tiên', () => {
    const agents = [
      makeAgent('a1', { topics: ['python', 'coding'] } as any),
      makeAgent('a2', { topics: ['cooking'] } as any),
    ];

    // Cả 2 chưa nói → score chênh lệch do topic
    const a1Score = (selector as any).computeScore(
      agents[0],
      {
        room: { topic: 'python programming' } as any,
        recentMessages: [],
        totalMessagesByAgent: new Map(),
      }
    );
    const a2Score = (selector as any).computeScore(
      agents[1],
      {
        room: { topic: 'python programming' } as any,
        recentMessages: [],
        totalMessagesByAgent: new Map(),
      }
    );

    // Assert: a1 (liên quan python) score cao hơn a2 (chỉ nấu ăn)
    expect(a1Score).toBeGreaterThan(a2Score);
  });
});
