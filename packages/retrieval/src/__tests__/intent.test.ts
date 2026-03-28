// packages/retrieval/src/__tests__/intent.test.ts
import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../intent.js';

describe('classifyIntent', () => {
  // ─── Rules-based classification ───────────────────────────────────────

  it('classifies "who calls" as GRAPH', async () => {
    const result = await classifyIntent('who calls validateToken');
    expect(result.intent).toBe('GRAPH');
    expect(result.method).toBe('rules');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('classifies "what depends on" as GRAPH', async () => {
    const result = await classifyIntent('what depends on the auth module');
    expect(result.intent).toBe('GRAPH');
  });

  it('classifies "callers of" as GRAPH', async () => {
    const result = await classifyIntent('find callers of processPayment');
    expect(result.intent).toBe('GRAPH');
  });

  it('classifies "how does" as SEMANTIC', async () => {
    const result = await classifyIntent('how does the caching layer work');
    expect(result.intent).toBe('SEMANTIC');
    expect(result.method).toBe('rules');
  });

  it('classifies "explain" as SEMANTIC', async () => {
    const result = await classifyIntent('explain the authentication flow');
    expect(result.intent).toBe('SEMANTIC');
  });

  it('classifies single PascalCase word as IDENTIFIER', async () => {
    const result = await classifyIntent('AuthService');
    expect(result.intent).toBe('IDENTIFIER');
    expect(result.method).toBe('rules');
  });

  it('classifies single snake_case word as IDENTIFIER', async () => {
    const result = await classifyIntent('get_user_by_id');
    expect(result.intent).toBe('IDENTIFIER');
  });

  it('classifies "where is defined" as IDENTIFIER', async () => {
    const result = await classifyIntent('where is AuthService defined');
    expect(result.intent).toBe('IDENTIFIER');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it('returns HYBRID for empty query', async () => {
    const result = await classifyIntent('');
    expect(result.intent).toBe('HYBRID');
    expect(result.method).toBe('fallback');
  });

  it('returns HYBRID for single character', async () => {
    const result = await classifyIntent('x');
    expect(result.intent).toBe('HYBRID');
    expect(result.method).toBe('fallback');
  });

  it('returns HYBRID for ambiguous queries (no embedding provider)', async () => {
    const result = await classifyIntent('some random query about code');
    expect(result.intent).toBe('HYBRID');
    expect(result.method).toBe('fallback');
  });

  it('handles very long queries without throwing', async () => {
    const longQuery = 'find '.repeat(1500);
    const result = await classifyIntent(longQuery);
    expect(result.intent).toBeDefined();
    expect(result.method).toBe('fallback'); // Too long, rules-only
  });

  it('classifies "impact of changing" as GRAPH', async () => {
    const result = await classifyIntent('impact of changing the database schema');
    expect(result.intent).toBe('GRAPH');
  });

  it('classifies "what is the purpose" as SEMANTIC', async () => {
    const result = await classifyIntent('what is the purpose of this middleware');
    expect(result.intent).toBe('SEMANTIC');
  });
});
