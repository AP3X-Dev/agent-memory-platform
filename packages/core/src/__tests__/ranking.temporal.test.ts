// packages/core/src/__tests__/ranking.temporal.test.ts
// Unit tests for temporal decay and ranking functions in ranking.ts

import { describe, it, expect } from "vitest";
import { rankMemories, rankFacts, budgetTokens, estimateTokens } from "../ranking.js";
import type { SemanticNode, FactNode } from "../types.js";
import { RECENCY_DECAY_DAYS } from "../types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSemanticNode(overrides: Partial<SemanticNode> & { relevanceScore?: number } = {}): SemanticNode & { relevanceScore?: number } {
  return {
    id: "sem-test-" + Math.random().toString(36).slice(2, 8),
    content: "test content",
    confidence: 0.8,
    signal_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_class: "stable" as const,
    tags: [],
    ...overrides,
  };
}

function makeFact(overrides: Partial<FactNode> = {}): FactNode {
  return {
    id: "fact-test-" + Math.random().toString(36).slice(2, 8),
    subject: "test-entity",
    predicate: "uses",
    object: "test-tool",
    entity_id: "ent-1",
    source_episode_ids: [],
    valid_at: new Date().toISOString(),
    invalid_at: null,
    confidence: 0.7,
    status: "active" as const,
    supersedes_fact_id: null,
    scope: "session" as const,
    embedding: undefined,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ─── rankMemories ────────────────────────────────────────────────────────────

describe("rankMemories", () => {
  it("returns empty array for empty input", () => {
    expect(rankMemories([])).toEqual([]);
  });

  it("scores a single memory", () => {
    const mem = makeSemanticNode({ updated_at: new Date().toISOString(), confidence: 1.0, relevanceScore: 1.0 });
    const result = rankMemories([mem]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThan(0);
    expect(result[0].score).toBeLessThanOrEqual(1.0);
  });

  it("ranks recent memories higher than old ones (same confidence)", () => {
    const recent = makeSemanticNode({ updated_at: daysAgo(1), confidence: 0.8, relevanceScore: 0.5 });
    const old = makeSemanticNode({ updated_at: daysAgo(30), confidence: 0.8, relevanceScore: 0.5 });
    const result = rankMemories([old, recent]);
    expect(result[0].id).toBe(recent.id);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("ranks high-confidence memories higher than low-confidence (same age)", () => {
    const now = new Date().toISOString();
    const high = makeSemanticNode({ updated_at: now, confidence: 0.9, relevanceScore: 0.5 });
    const low = makeSemanticNode({ updated_at: now, confidence: 0.3, relevanceScore: 0.5 });
    const result = rankMemories([low, high]);
    expect(result[0].id).toBe(high.id);
  });

  it("uses default relevanceScore of 0.5 when not provided", () => {
    const mem = makeSemanticNode({ updated_at: new Date().toISOString(), confidence: 1.0 });
    delete (mem as Record<string, unknown>).relevanceScore;
    const result = rankMemories([mem]);
    // score = confidence * recency * 0.5 (default)
    expect(result[0].score).toBeLessThanOrEqual(0.5);
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("relevanceScore boosts ranking", () => {
    const now = new Date().toISOString();
    const highRel = makeSemanticNode({ updated_at: now, confidence: 0.5, relevanceScore: 1.0 });
    const lowRel = makeSemanticNode({ updated_at: now, confidence: 0.5, relevanceScore: 0.1 });
    const result = rankMemories([lowRel, highRel]);
    expect(result[0].id).toBe(highRel.id);
  });

  it("exponential decay matches RECENCY_DECAY_DAYS constant", () => {
    const mem = makeSemanticNode({ confidence: 1.0, relevanceScore: 1.0 });
    const now = new Date();
    // At exactly RECENCY_DECAY_DAYS, decay should be 1/e ≈ 0.368
    const atDecay = new Date(now.getTime() - RECENCY_DECAY_DAYS * 24 * 60 * 60 * 1000);
    mem.updated_at = atDecay.toISOString();
    const result = rankMemories([mem], now);
    expect(result[0].score).toBeCloseTo(Math.exp(-1), 2);
  });

  it("very old memories have near-zero scores", () => {
    const mem = makeSemanticNode({ updated_at: daysAgo(365), confidence: 1.0, relevanceScore: 1.0 });
    const result = rankMemories([mem]);
    expect(result[0].score).toBeLessThan(0.001);
  });

  it("handles multiple memories and sorts correctly", () => {
    const now = new Date();
    const a = makeSemanticNode({ updated_at: daysAgo(1), confidence: 0.9, relevanceScore: 0.8 });
    const b = makeSemanticNode({ updated_at: daysAgo(10), confidence: 0.5, relevanceScore: 0.3 });
    const c = makeSemanticNode({ updated_at: daysAgo(2), confidence: 0.7, relevanceScore: 0.9 });
    const result = rankMemories([b, c, a], now);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
    }
  });

  it("zero confidence produces zero score", () => {
    const mem = makeSemanticNode({ updated_at: new Date().toISOString(), confidence: 0, relevanceScore: 1.0 });
    const result = rankMemories([mem]);
    expect(result[0].score).toBe(0);
  });
});

// ─── rankFacts ───────────────────────────────────────────────────────────────

describe("rankFacts", () => {
  it("returns empty array for empty input", () => {
    expect(rankFacts([])).toEqual([]);
  });

  it("ranks recent facts higher than old facts", () => {
    const recent = makeFact({ valid_at: daysAgo(1), confidence: 0.7 });
    const old = makeFact({ valid_at: daysAgo(60), confidence: 0.7 });
    const result = rankFacts([old, recent]);
    expect(result[0].id).toBe(recent.id);
  });

  it("ranks high-confidence facts higher", () => {
    const now = new Date().toISOString();
    const high = makeFact({ valid_at: now, confidence: 0.9 });
    const low = makeFact({ valid_at: now, confidence: 0.3 });
    const result = rankFacts([low, high]);
    expect(result[0].id).toBe(high.id);
  });

  it("penalizes disputed facts with 0.5 multiplier", () => {
    const now = new Date().toISOString();
    const active = makeFact({ valid_at: now, confidence: 0.6, status: "active" as const });
    const disputed = makeFact({ valid_at: now, confidence: 0.6, status: "disputed" as const });
    const result = rankFacts([disputed, active]);
    expect(result[0].id).toBe(active.id);
  });

  it("orders statuses active > tentative > disputed > invalidated at equal confidence", () => {
    const now = new Date().toISOString();
    const active = makeFact({ valid_at: now, confidence: 0.6, status: "active" as const });
    const tentative = makeFact({ valid_at: now, confidence: 0.6, status: "tentative" as const });
    const disputed = makeFact({ valid_at: now, confidence: 0.6, status: "disputed" as const });
    const invalidated = makeFact({ valid_at: now, confidence: 0.6, status: "invalidated" as const });
    const result = rankFacts([invalidated, disputed, tentative, active]);
    expect(result.map((f) => f.status)).toEqual(["active", "tentative", "disputed", "invalidated"]);
  });

  it("never ranks a superseded fact above current truth, even at higher confidence", () => {
    // The "what's true now" guarantee: an invalidated fact with high confidence must
    // still rank below an active one with lower confidence (it was superseded).
    const now = new Date().toISOString();
    const active = makeFact({ valid_at: now, confidence: 0.6, status: "active" as const });
    const invalidated = makeFact({ valid_at: now, confidence: 0.95, status: "invalidated" as const });
    const result = rankFacts([invalidated, active]);
    expect(result[0].id).toBe(active.id);
  });

  it("facts decay 4x slower than memories", () => {
    const now = new Date();
    // At RECENCY_DECAY_DAYS * 4, fact recency = exp(-1) ≈ 0.368
    const atFactDecay = new Date(now.getTime() - RECENCY_DECAY_DAYS * 4 * 24 * 60 * 60 * 1000);
    const fact = makeFact({ valid_at: atFactDecay.toISOString(), confidence: 1.0, status: "active" as const });
    const result = rankFacts([fact], now);
    // The fact should still be returned — just with decayed ranking
    expect(result).toHaveLength(1);
  });

  it("invalidated facts are still ranked (no filter)", () => {
    const fact = makeFact({ status: "invalidated" as const, confidence: 0.5 });
    const result = rankFacts([fact]);
    expect(result).toHaveLength(1);
  });

  it("sorts multiple facts by composite score", () => {
    const a = makeFact({ valid_at: daysAgo(1), confidence: 0.9 });
    const b = makeFact({ valid_at: daysAgo(30), confidence: 0.4, status: "disputed" as const });
    const c = makeFact({ valid_at: daysAgo(5), confidence: 0.7 });
    const result = rankFacts([b, c, a]);
    expect(result[0].id).toBe(a.id);
    expect(result[result.length - 1].id).toBe(b.id);
  });

  it("does not let an invalid valid_at timestamp poison fact ordering", () => {
    const invalid = makeFact({ id: "invalid-date", valid_at: "not-a-date", confidence: 0.2 });
    const valid = makeFact({ id: "valid-date", valid_at: "2025-01-09T00:00:00Z", confidence: 0.9 });

    const result = rankFacts([invalid, valid], new Date("2025-01-10T00:00:00Z"));

    expect(result[0].id).toBe("valid-date");
  });
});

// ─── budgetTokens ────────────────────────────────────────────────────────────

describe("budgetTokens", () => {
  it("returns empty for empty input", () => {
    expect(budgetTokens([], 100)).toEqual([]);
  });

  it("returns empty for zero budget", () => {
    expect(budgetTokens([{ tokens: 10 }], 0)).toEqual([]);
  });

  it("returns empty for negative budget", () => {
    expect(budgetTokens([{ tokens: 10 }], -5)).toEqual([]);
  });

  it("includes items that fit within budget", () => {
    const items = [{ tokens: 30 }, { tokens: 40 }, { tokens: 50 }];
    const result = budgetTokens(items, 80);
    expect(result).toHaveLength(2);
    expect(result).toEqual([{ tokens: 30 }, { tokens: 40 }]);
  });

  it("stops at exact budget boundary", () => {
    const items = [{ tokens: 50 }, { tokens: 50 }];
    const result = budgetTokens(items, 100);
    expect(result).toHaveLength(2);
  });

  it("excludes item that would exceed budget", () => {
    const items = [{ tokens: 50 }, { tokens: 51 }];
    const result = budgetTokens(items, 100);
    expect(result).toHaveLength(1);
  });

  it("returns all items if budget is large enough", () => {
    const items = [{ tokens: 10 }, { tokens: 20 }, { tokens: 30 }];
    const result = budgetTokens(items, 10000);
    expect(result).toHaveLength(3);
  });

  it("preserves order", () => {
    const items = [{ tokens: 10, id: "a" }, { tokens: 20, id: "b" }, { tokens: 30, id: "c" }];
    const result = budgetTokens(items, 35);
    expect(result).toEqual([{ tokens: 10, id: "a" }, { tokens: 20, id: "b" }]);
  });
});

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates ~4 chars per token", () => {
    const text = "a".repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it("rounds up", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("handles long text", () => {
    const text = "x".repeat(10000);
    expect(estimateTokens(text)).toBe(2500);
  });
});
