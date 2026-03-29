// packages/core/src/__tests__/embedding.regression.test.ts
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
  it('BUG-0006: embed() throws descriptive error when response.data is empty', async () => {
    const provider = new OpenAIEmbedding('fake-key');
    // Access the mocked client to set up empty data response
    const client = (provider as unknown as { client: { embeddings: { create: ReturnType<typeof vi.fn> } } }).client;
    client.embeddings.create.mockResolvedValue({ data: [] });

    await expect(provider.embed('test input')).rejects.toThrow(
      'OpenAI embeddings API returned empty data array',
    );
  });
});
