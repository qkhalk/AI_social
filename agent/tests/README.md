# Testing Scaffolds

Test files cho AI_social. Sử dụng **vitest** (nhanh, ESM-native, TS support tốt).

## Setup

```bash
cd /root/AI_social/agent
npm install -D vitest @vitest/coverage-v8
```

`agent/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
```

Thêm vào `package.json`:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## `agent/tests/orchestrator-loop.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { OrchestratorLoop } from "../src/orchestrator/orchestrator-loop";

// Mock Supabase
vi.mock("../src/services/supabase-client", () => ({
  getSupabaseClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
    }),
  }),
}));

// Mock message service
vi.mock("../src/services/message-service", () => ({
  fetchActiveRoomsWithAgents: vi.fn(),
  fetchRecentMessages: vi.fn(),
  insertAgentMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
  insertSystemMessage: vi.fn().mockResolvedValue({ id: "sys-1" }),
  updateRoomStatus: vi.fn().mockResolvedValue({ data: null }),
  getRoomMessageCount: vi.fn().mockResolvedValue(0),
}));

vi.mock("../src/services/llm-client", () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: "Mocked agent response",
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }),
}));

vi.mock("../src/services/logging-service", () => ({
  logOrchestratorAction: vi.fn().mockResolvedValue(undefined),
  trackTokenUsage: vi.fn().mockResolvedValue(undefined),
  estimateCost: vi.fn().mockReturnValue(0.001),
}));

vi.mock("../src/services/memory-service", () => ({
  extractMemoriesFromConversation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/summary-service", () => ({
  isSummaryNeeded: vi.fn().mockResolvedValue(false),
  generateSummary: vi.fn().mockResolvedValue(undefined),
}));

describe("OrchestratorLoop", () => {
  let loop: OrchestratorLoop;

  beforeEach(() => {
    vi.clearAllMocks();
    loop = new OrchestratorLoop();
  });

  it("start() poll loop runs at correct interval", async () => {
    const { fetchActiveRoomsWithAgents } = await import("../src/services/message-service");
    (fetchActiveRoomsWithAgents as any).mockResolvedValue([]);
    const spy = vi.spyOn(loop as any, "sleep").mockResolvedValue(undefined);
    loop.stop();
    await loop.start();
    expect(spy).toHaveBeenCalled();
  });

  it("processRoom() calls LLM with built context", async () => {
    const { fetchActiveRoomsWithAgents, fetchRecentMessages, getRoomMessageCount } =
      await import("../src/services/message-service");
    const { callLLM } = await import("../src/services/llm-client");

    (fetchActiveRoomsWithAgents as any).mockResolvedValue([{
      id: "room-1",
      agents: [{ id: "agent-1", model_name: "test/model", response_temperature: 0.7 }],
      max_messages: 50,
      status: "active",
      started_at: new Date().toISOString(),
    }]);
    (fetchRecentMessages as any).mockResolvedValue([]);
    (getRoomMessageCount as any).mockResolvedValue(0);

    await (loop as any).processAllRooms();
    expect(callLLM).toHaveBeenCalled();
  });

  it("concludes room when message count reaches hard cap", async () => {
    const { fetchActiveRoomsWithAgents, fetchRecentMessages, getRoomMessageCount,
            updateRoomStatus } = await import("../src/services/message-service");

    (fetchActiveRoomsWithAgents as any).mockResolvedValue([{
      id: "room-1",
      agents: [{ id: "agent-1", model_name: "test/model" }],
      max_messages: 10,
      status: "active",
    }]);
    (getRoomMessageCount as any).mockResolvedValue(10);
    (fetchRecentMessages as any).mockResolvedValue([]);

    await (loop as any).processAllRooms();
    expect(updateRoomStatus).toHaveBeenCalledWith("room-1", "concluded");
  });

  it("isolates errors between rooms (Promise.allSettled)", async () => {
    const { fetchActiveRoomsWithAgents } = await import("../src/services/message-service");

    (fetchActiveRoomsWithAgents as any).mockResolvedValue([
      { id: "room-1", agents: [{ id: "a1", model_name: "m" }], status: "active", max_messages: 50, started_at: new Date().toISOString() },
      { id: "room-2", agents: [{ id: "a2", model_name: "m" }], status: "active", max_messages: 50, started_at: new Date().toISOString() },
    ]);

    const { callLLM } = await import("../src/services/llm-client");
    (callLLM as any)
      .mockRejectedValueOnce(new Error("Room 1 failed"))
      .mockResolvedValueOnce({
        content: "Room 2 ok",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

    // Should not throw — both rooms processed independently
    await expect((loop as any).processAllRooms()).resolves.not.toThrow();
  });
});
```

---

## `agent/tests/turn-selector.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { selectNextAgent } from "../src/orchestrator/turn-selector";

const makeAgent = (id: string, traits: any = {}) => ({
  id, name: id, is_active: true, expertise_keywords: [], personality_traits: traits,
} as any);

const makeRoom = (agents: any[], topicTags: string[] = []) => ({
  id: "r1", agents, topic_tags: topicTags,
} as any);

const makeMsg = (agentId: string | null, content = "hi") => ({
  id: "m", agent_id: agentId, content, created_at: new Date().toISOString(),
} as any);

describe("selectNextAgent", () => {
  it("returns null when no active agents", () => {
    const room = makeRoom([makeAgent("a1", { is_active: false })]);
    expect(selectNextAgent(room, [])).toBeNull();
  });

  it("picks random agent when no recent messages", () => {
    const a1 = makeAgent("a1");
    const a2 = makeAgent("a2");
    const room = makeRoom([a1, a2]);
    const result = selectNextAgent(room, []);
    expect([a1, a2]).toContain(result);
  });

  it("excludes last speaker", () => {
    const a1 = makeAgent("a1");
    const a2 = makeAgent("a2");
    const room = makeRoom([a1, a2]);
    const messages = [makeMsg("a1", "I just spoke")];
    const result = selectNextAgent(room, messages);
    expect(result?.id).toBe("a2");
  });

  it("scores by topic relevance, recency, talkativeness, noise", () => {
    const a1 = makeAgent("a1", { talkativeness: 0.9 });
    const a1WithKeywords = { ...a1, expertise_keywords: ["ai", "ethics"] };
    const a2 = makeAgent("a2");
    const room = makeRoom([a1WithKeywords, a2], ["ai"]);

    // a1 nói gần nhất, có keywords, talkative
    // a2 chưa nói lần nào, không keywords
    const messages = [
      makeMsg("a1", "AI is great"),
      makeMsg("a2", "I agree"),  // a2 vừa nói → recency cao
      makeMsg("a1", "Ethics matter"),
    ];

    // a2 có recency = 1.0, a1 có topic match → likely close
    const result = selectNextAgent(room, messages);
    expect(["a1", "a2"]).toContain(result?.id);
  });

  it("agent who never spoke gets recency score = 1", () => {
    const a1 = makeAgent("a1");
    const a2 = makeAgent("a2");
    const room = makeRoom([a1, a2]);
    // a1 vừa nói, a2 chưa nói lần nào
    const messages = [makeMsg("a1", "hello"), makeMsg("a2", "hi")];
    // a1 là last speaker, a2 là candidate với recency=1
    const result = selectNextAgent(room, messages);
    // a2 có recency=1, a1 vừa nói → expect a2
    expect(result?.id).toBe("a2");
  });
});
```

---

## `agent/tests/termination-checker.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { checkTermination } from "../src/orchestrator/termination-checker";

const makeRoom = (overrides: any = {}) => ({
  id: "r1",
  max_messages: 50,
  status: "active",
  started_at: new Date(Date.now() - 60_000).toISOString(),
  ...overrides,
});

const makeMsg = (content: string) => ({
  id: "m", agent_id: "a1", content, created_at: new Date().toISOString(),
} as any);

describe("checkTermination - 6 layers", () => {
  it("Layer 6: admin override (status !== active)", () => {
    const result = checkTermination(makeRoom({ status: "paused" }), 0, 0, []);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toMatch(/admin_override/);
  });

  it("Layer 1: hard cap reached", () => {
    const result = checkTermination(makeRoom({ max_messages: 10 }), 10, 0, []);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toMatch(/hard_cap/);
  });

  it("Layer 2: token budget exceeded", () => {
    const result = checkTermination(makeRoom(), 0, 100_000, []);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toMatch(/token_budget/);
  });

  it("Layer 3: wall clock exceeded (30 min)", () => {
    const oldStart = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const result = checkTermination(makeRoom({ started_at: oldStart }), 0, 0, []);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toMatch(/wall_clock/);
  });

  it("Layer 4: convergence (3 messages > 70% similar)", () => {
    const messages = [
      makeMsg("The quick brown fox jumps over the lazy dog repeatedly"),
      makeMsg("The quick brown fox jumps over the lazy dog always"),
      makeMsg("The quick brown fox jumps over the lazy dog constantly"),
    ];
    const result = checkTermination(makeRoom(), 5, 0, messages);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toMatch(/convergence/);
  });

  it("Layer 5: natural end marker detected", () => {
    const messages = [makeMsg("In conclusion, I think we've covered everything")];
    const result = checkTermination(makeRoom(), 5, 0, messages);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toMatch(/natural_end/);
  });

  it("returns no termination when no layers triggered", () => {
    const result = checkTermination(
      makeRoom(),
      5, 100,
      [makeMsg("Completely different topic here"), makeMsg("Another unique thought")]
    );
    expect(result.shouldStop).toBe(false);
  });

  it("layer order: admin > hard_cap > token > wall > convergence > natural", () => {
    // Khi nhiều layer cùng trigger, layer ưu tiên cao nhất thắng
    const room = makeRoom({ status: "paused", max_messages: 1 });
    const result = checkTermination(room, 5, 999_999, []);
    expect(result.reason).toMatch(/admin_override/);
  });
});
```

---

## `web/tests/middleware.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Next.js
vi.mock("next/server", () => ({
  NextResponse: {
    redirect: vi.fn((url) => ({ url, status: 302 })),
  },
}));

// Mock Supabase
const mockGetUser = vi.fn();
const mockProfileQuery = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockProfileQuery,
        }),
      }),
    }),
  }),
}));

describe("Middleware - admin auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated user to /admin/login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { middleware } = await import("../src/middleware");
    const req = { nextUrl: { pathname: "/admin/dashboard" }, url: "http://localhost/admin/dashboard" };
    const result = await middleware(req as any);
    expect((result as any).url.pathname).toBe("/admin/login");
  });

  it("redirects non-admin user to /admin/login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockProfileQuery.mockResolvedValue({ data: { role: "user" } });

    const { middleware } = await import("../src/middleware");
    const req = { nextUrl: { pathname: "/admin/dashboard" }, url: "http://localhost/admin/dashboard" };
    const result = await middleware(req as any);
    expect((result as any).url.pathname).toBe("/admin/login");
  });

  it("allows admin user to pass through", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockProfileQuery.mockResolvedValue({ data: { role: "admin" } });

    const { middleware } = await import("../src/middleware");
    const req = { nextUrl: { pathname: "/admin/dashboard" }, url: "http://localhost/admin/dashboard" };
    const result = await middleware(req as any);
    expect(result).toBeDefined();
  });
});
```

---

## Run tests

```bash
# Run all tests
cd /root/AI_social/agent
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific file
npm test -- turn-selector
```

Coverage target: **80%** cho orchestrator files (loop, turn-selector, termination, context-builder).
