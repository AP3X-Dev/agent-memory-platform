import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the openai SDK so no network is touched. createMock is hoisted so the
// vi.mock factory can close over it.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('openai', () => {
  class FakeOpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: { apiKey: string }) {}
    static RateLimitError = class extends Error {};
    static APIConnectionError = class extends Error {};
    static InternalServerError = class extends Error {};
  }
  return { default: FakeOpenAI };
});

import { OpenAiLlmClient, NullLlmClient, DEFAULT_MODELS } from '../llm.js';

describe('NullLlmClient', () => {
  it('is unavailable, returns empty text, and falls back to default models', async () => {
    const c = new NullLlmClient();
    expect(c.available).toBe(false);
    await expect(c.chat()).resolves.toBe('');
    expect(c.modelFor('extraction')).toBe(DEFAULT_MODELS.extraction);
    expect(c.modelFor('synthesis')).toBe(DEFAULT_MODELS.synthesis);
  });
});

describe('OpenAiLlmClient', () => {
  // Block body: an arrow returning createMock.mockReset() would return the mock
  // fn, which vitest then calls as a teardown — invoking the throwing mock.
  beforeEach(() => { createMock.mockReset(); });

  it('is available and resolves per-task models with overrides', () => {
    const c = new OpenAiLlmClient('sk-test', { synthesis: 'gpt-5-custom' });
    expect(c.available).toBe(true);
    expect(c.modelFor('synthesis')).toBe('gpt-5-custom');
    expect(c.modelFor('extraction')).toBe(DEFAULT_MODELS.extraction); // unset → default
  });

  it('passes model, maxTokens, and jsonMode through and returns the content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'hello' } }] });
    const c = new OpenAiLlmClient('sk-test');
    const out = await c.chat([{ role: 'user', content: 'hi' }], {
      model: 'gpt-pick',
      maxTokens: 321,
      jsonMode: true,
    });
    expect(out).toBe('hello');
    const arg = createMock.mock.calls[0]![0];
    expect(arg.model).toBe('gpt-pick');
    expect(arg.max_tokens).toBe(321);
    expect(arg.response_format).toEqual({ type: 'json_object' });
  });

  it('defaults to the synthesis model when none is given', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'x' } }] });
    const c = new OpenAiLlmClient('sk-test', { synthesis: 'syn-default' });
    await c.chat([{ role: 'user', content: 'hi' }]);
    expect(createMock.mock.calls[0]![0].model).toBe('syn-default');
  });

  it('propagates non-transient errors without retrying', async () => {
    createMock.mockImplementation(() => { throw new Error('invalid payload'); });
    const c = new OpenAiLlmClient('sk-test');
    let caught: unknown;
    try {
      await c.chat([{ role: 'user', content: 'hi' }]);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error | undefined)?.message).toContain('invalid payload');
    expect(createMock).toHaveBeenCalledTimes(1); // no retry on non-transient
  });
});
