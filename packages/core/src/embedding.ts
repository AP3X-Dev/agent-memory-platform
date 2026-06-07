// packages/core/src/embedding.ts
import OpenAI from 'openai';
import type { EmbeddingProvider } from './types.js';

export class OpenAIEmbedding implements EmbeddingProvider {
  private client: OpenAI;
  private model = 'text-embedding-3-small';
  /** Real provider: semantic vector search is usable. */
  readonly available = true;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({ model: this.model, input: text });
      if (!response.data || response.data.length === 0) {
        throw new Error('OpenAI embeddings API returned empty data array');
      }
      return response.data[0].embedding;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenAI embedding request failed: ${message}`);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({ model: this.model, input: texts });
      return response.data.map(d => d.embedding);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`OpenAI embedBatch request failed: ${message}`);
    }
  }
}
