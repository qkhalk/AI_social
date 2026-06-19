/**
 * Test: termination-checker.test.ts
 * Mục đích: Test 6 layer termination logic của phòng chat
 *
 * 6 layer theo thứ tự ưu tiên:
 * 1. hard_cap: messageCount >= maxMessages
 * 2. token_budget: totalTokensUsed >= ROOM_TOKEN_BUDGET
 * 3. time_limit: elapsed > ROOM_MAX_DURATION_MS
 * 4. repetition: 3 messages gần nhất có Jaccard > 0.7
 * 5. natural_end: marker "###END###" trong last message
 * 6. admin_override: status !== 'active'
 *
 * Chạy: `npx vitest run tests/termination-checker.test.ts`
 */
import { describe, it, expect } from 'vitest';
import { TerminationChecker } from '../src/orchestrator/termination-checker-class';
import type { Room, Message } from '../src/orchestrator/types';

// ============================================================================
// HELPERS
// ============================================================================

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    status: 'active',
    topic: 'Test',
    maxMessages: 20,
    messageCount: 0,
    startedAt: Date.now() - 1000,
    agents: [],
    ...overrides,
  };
}

function makeMessage(content: string, createdAt: number = Date.now()): Message {
  return {
    id: `msg-${createdAt}`,
    roomId: 'room-1',
    agentId: 'agent-1',
    content,
    tokenCount: 10,
    createdAt,
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('TerminationChecker', () => {
  const checker = new TerminationChecker({
    roomTokenBudget: 10000,
    roomMaxDurationMs: 3600000, // 1 giờ
    repetitionThreshold: 0.7,
    repetitionWindow: 3,
    endMarker: '###END###',
  });

  // --------------------------------------------------------------------------
  // Test 1: Layer 1 — hard_cap (messageCount >= maxMessages)
  // --------------------------------------------------------------------------
  it('Layer 1: messageCount >= maxMessages → stop', () => {
    const room = makeRoom({ messageCount: 20, maxMessages: 20 });

    const result = checker.check({ room, recentMessages: [] });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('hard_cap');
  });

  // --------------------------------------------------------------------------
  // Test 2: Layer 2 — token_budget
  // --------------------------------------------------------------------------
  it('Layer 2: totalTokensUsed >= ROOM_TOKEN_BUDGET → stop', () => {
    const room = makeRoom();

    const result = checker.check({
      room,
      recentMessages: [],
      totalTokensUsed: 10000,
    });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('token_budget');
  });

  // --------------------------------------------------------------------------
  // Test 3: Layer 3 — time_limit
  // --------------------------------------------------------------------------
  it('Layer 3: elapsed > ROOM_MAX_DURATION_MS → stop', () => {
    const twoHoursAgo = Date.now() - 7200 * 1000; // 2 giờ trước
    const room = makeRoom({ startedAt: twoHoursAgo });

    const result = checker.check({ room, recentMessages: [] });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('time_limit');
  });

  // --------------------------------------------------------------------------
  // Test 4: Layer 4 — repetition (3 messages có Jaccard > 0.7)
  // --------------------------------------------------------------------------
  it('Layer 4: 3 messages gần nhất có Jaccard > 0.7 → stop', () => {
    const now = Date.now();
    const room = makeRoom();

    // 3 messages gần như identical (Jaccard cao)
    const messages = [
      makeMessage('hello world foo bar baz qux', now - 2000),
      makeMessage('hello world foo bar baz quux', now - 1000),
      makeMessage('hello world foo bar baz corge', now),
    ];

    const result = checker.check({ room, recentMessages: messages });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('repetition');
  });

  // --------------------------------------------------------------------------
  // Test 5: Layer 5 — natural_end (marker trong last message)
  // --------------------------------------------------------------------------
  it('Layer 5: marker ###END### trong last message → stop', () => {
    const now = Date.now();
    const room = makeRoom();

    const messages = [
      makeMessage('Some normal message', now - 1000),
      makeMessage('I think we should ###END### this discussion', now),
    ];

    const result = checker.check({ room, recentMessages: messages });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('natural_end');
  });

  // --------------------------------------------------------------------------
  // Test 6: Layer 6 — admin_override (status !== 'active')
  // --------------------------------------------------------------------------
  it('Layer 6: status !== active → stop', () => {
    const room = makeRoom({ status: 'paused' });

    const result = checker.check({ room, recentMessages: [] });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('admin_override');
  });

  // --------------------------------------------------------------------------
  // Test 7: Thứ tự ưu tiên — admin > hard_cap > token > time > repetition > natural
  // --------------------------------------------------------------------------
  it('Thứ tự ưu tiên: admin_override > hard_cap > token_budget > ...', () => {
    // Cùng lúc có admin + hard_cap + token → admin thắng (cao nhất)
    const room = makeRoom({
      status: 'paused', // admin
      messageCount: 100, // hard_cap
    });

    const result = checker.check({
      room,
      recentMessages: [],
      totalTokensUsed: 999999, // token
    });

    expect(result.reason).toBe('admin_override');
  });

  it('hard_cap thắng token_budget khi không có admin override', () => {
    const room = makeRoom({ messageCount: 100 });

    const result = checker.check({
      room,
      recentMessages: [],
      totalTokensUsed: 999999,
    });

    expect(result.reason).toBe('hard_cap');
  });

  it('token_budget thắng time_limit khi không có hard_cap', () => {
    const room = makeRoom({ startedAt: Date.now() - 99999999 });

    const result = checker.check({
      room,
      recentMessages: [],
      totalTokensUsed: 999999,
    });

    expect(result.reason).toBe('token_budget');
  });

  // --------------------------------------------------------------------------
  // Test 8: Jaccard = 0 khi không có intersection
  // --------------------------------------------------------------------------
  it('Jaccard = 0 khi 2 message không có từ chung', () => {
    const now = Date.now();
    const room = makeRoom();

    const messages = [
      makeMessage('alpha beta gamma', now - 1000),
      makeMessage('delta epsilon zeta', now),
    ];

    const result = checker.check({ room, recentMessages: messages });

    // Không nên stop vì repetition
    expect(result.shouldStop).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test 9: Jaccard = 1 khi identical word set
  // --------------------------------------------------------------------------
  it('Jaccard ≈ 1 khi word set identical → repetition', () => {
    const now = Date.now();
    const room = makeRoom();

    const messages = [
      makeMessage('foo bar baz', now - 2000),
      makeMessage('bar baz foo', now - 1000),
      makeMessage('baz foo bar', now),
    ];

    const result = checker.check({ room, recentMessages: messages });

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('repetition');
  });

  // --------------------------------------------------------------------------
  // Test 10: Không stop khi phòng hoàn toàn bình thường
  // --------------------------------------------------------------------------
  it('Không stop khi không có layer nào trigger', () => {
    const room = makeRoom({ messageCount: 5, maxMessages: 20, startedAt: Date.now() - 1000 });
    const messages = [
      makeMessage('Hello there', Date.now() - 5000),
      makeMessage('How are you?', Date.now() - 3000),
      makeMessage('I am good thanks', Date.now() - 1000),
    ];

    const result = checker.check({
      room,
      recentMessages: messages,
      totalTokensUsed: 500,
    });

    expect(result.shouldStop).toBe(false);
    expect(result.reason).toBeNull();
  });
});
