// packages/core/src/__tests__/embedding.test.ts
import { describe, it, expect } from 'vitest';
import { OpenAIEmbedding } from '../embedding.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

describe('OpenAIEmbedding', () => {
  it('embed returns a 1536-dimensional number array', async () => {
    if (!OPENAI_API_KEY) {
      console.warn('[skip] OPENAI_API_KEY not set — skipping embed test');
      return;
    }

    const provider = new OpenAIEmbedding(OPENAI_API_KEY);
    const result = await provider.embed('Hello, world!');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1536);
    expect(typeof result[0]).toBe('number');
  });

  it('embedBatch returns the correct number of embeddings', async () => {
    if (!OPENAI_API_KEY) {
      console.warn('[skip] OPENAI_API_KEY not set — skipping embedBatch test');
      return;
    }

    const provider = new OpenAIEmbedding(OPENAI_API_KEY);
    const texts = ['First sentence.', 'Second sentence.', 'Third sentence.'];
    const results = await provider.embedBatch(texts);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(texts.length);

    for (const embedding of results) {
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding).toHaveLength(1536);
      expect(typeof embedding[0]).toBe('number');
    }
  });

  it('embedBatch with a single text returns one embedding', async () => {
    if (!OPENAI_API_KEY) {
      console.warn('[skip] OPENAI_API_KEY not set — skipping embedBatch single-item test');
      return;
    }

    const provider = new OpenAIEmbedding(OPENAI_API_KEY);
    const results = await provider.embedBatch(['Only one.']);

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveLength(1536);
  });
});
