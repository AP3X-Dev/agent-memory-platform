import { describe, it, expect, vi } from 'vitest';
import { UnifiedAssembler } from '../assembler.js';
import type { UnifiedContext } from '../types.js';
import type { LlmClient } from '@memberry/core';

function fakeLlm(chat: LlmClient['chat'], available = true): LlmClient {
  return { available, chat, modelFor: (t) => `m-${t}` };
}

function ctxWith(ids: string[]): UnifiedContext {
  return {
    task: 'q',
    strategy: 'ranked',
    sections: [
      {
        heading: 'Knowledge',
        source_type: 'semantic',
        items: ids.map((id) => ({ id, content: `content-${id}`, score: 1, metadata: {} })),
      },
    ],
    token_count: 10,
    assembled_at: '2026-06-06T00:00:00.000Z',
  };
}

function makeAssembler(llm: LlmClient): UnifiedAssembler {
  // assemble() is stubbed per-test, so the driver/redis/embedding are never used.
  return new UnifiedAssembler({} as never, {} as never, null, null, {} as never, llm);
}

describe('UnifiedAssembler.ask (dialectic retrieval)', () => {
  it('synthesizes an answer and maps cited numbers to evidence node IDs', async () => {
    const chat = vi.fn().mockResolvedValue(JSON.stringify({ answer: 'X uses Y.', cited: [1, 3] }));
    const a = makeAssembler(fakeLlm(chat));
    const assembleSpy = vi.spyOn(a, 'assemble').mockResolvedValue(ctxWith(['a', 'b', 'c']));

    const r = await a.ask('does X use Y?', { level: 'medium' });

    expect(r.answer).toBe('X uses Y.');
    expect(r.cited_ids).toEqual(['a', 'c']); // [1,3] → a, c
    expect(r.level).toBe('medium');
    expect(r.evidence).toHaveLength(3);

    // medium → ranked retrieval at 6000 tokens, synthesis model
    expect(assembleSpy.mock.calls[0]![1]).toMatchObject({ strategy: 'ranked', max_tokens: 6000 });
    expect(chat.mock.calls[0]![1]).toMatchObject({ model: 'm-synthesis', maxTokens: 700, jsonMode: true });
  });

  it('honors the reasoning level (minimal → small budget, extraction model)', async () => {
    const chat = vi.fn().mockResolvedValue(JSON.stringify({ answer: 'ok', cited: [] }));
    const a = makeAssembler(fakeLlm(chat));
    const assembleSpy = vi.spyOn(a, 'assemble').mockResolvedValue(ctxWith(['a']));

    await a.ask('q', { level: 'minimal' });

    expect(assembleSpy.mock.calls[0]![1]).toMatchObject({ max_tokens: 1500 });
    expect(chat.mock.calls[0]![1]).toMatchObject({ model: 'm-extraction', maxTokens: 256 });
  });

  it('returns a no-evidence answer without calling the LLM when retrieval is empty', async () => {
    const chat = vi.fn();
    const a = makeAssembler(fakeLlm(chat));
    vi.spyOn(a, 'assemble').mockResolvedValue(ctxWith([]));

    const r = await a.ask('q');
    expect(r.cited_ids).toEqual([]);
    expect(r.answer).toMatch(/no relevant memory/i);
    expect(chat).not.toHaveBeenCalled();
  });

  it('degrades to raw text with no citations when the model returns non-JSON', async () => {
    const chat = vi.fn().mockResolvedValue('plain text answer, not json');
    const a = makeAssembler(fakeLlm(chat));
    vi.spyOn(a, 'assemble').mockResolvedValue(ctxWith(['a', 'b']));

    const r = await a.ask('q');
    expect(r.answer).toBe('plain text answer, not json');
    expect(r.cited_ids).toEqual([]);
  });

  it('throws a clear error when no LLM is configured', async () => {
    const a = makeAssembler(fakeLlm(vi.fn(), false));
    await expect(a.ask('q')).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
