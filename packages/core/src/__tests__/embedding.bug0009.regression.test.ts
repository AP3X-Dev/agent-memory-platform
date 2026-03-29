// packages/core/src/__tests__/embedding.bug0009.regression.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn(),
      };
    },
  };
});

import { OpenAIEmbedding } from '../embedding.js';

describe('OpenAIEmbedding regression', () => {
  it('BUG-0009: embed() wraps OpenAI API errors with descriptive message instead of unhandled rejection', async () => {
    // Before the fix, embed() and embedBatch() had no try/catch. A transient
    // OpenAI API failure propagated as an unhandled rejection, aborting the
    // entire store pipeline. The fix wraps errors with descriptive messages.

    const provider = new OpenAIEmbedding('fake-key');
    const client = (provider as unknown as { client: { embeddings: { create: ReturnType<typeof vi.fn> } } }).client;
    client.embeddings.create.mockRejectedValue(new Error('ECONNRESET'));

    await expect(provider.embed('test')).rejects.toThrow('OpenAI embedding request failed: ECONNRESET');
  });

  it('BUG-0009: embedBatch() wraps OpenAI API errors with descriptive message', async () => {
    const provider = new OpenAIEmbedding('fake-key');
    const client = (provider as unknown as { client: { embeddings: { create: ReturnType<typeof vi.fn> } } }).client;
    client.embeddings.create.mockRejectedValue(new Error('rate limit exceeded'));

    await expect(provider.embedBatch(['a', 'b'])).rejects.toThrow('OpenAI embedBatch request failed: rate limit exceeded');
  });
});
