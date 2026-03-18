// packages/core/src/embedding.ts
import OpenAI from 'openai';
import type { EmbeddingProvider } from './types.js';

export class OpenAIEmbedding implements EmbeddingProvider {
  private client: OpenAI;
  private model = 'text-embedding-3-small';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({ model: this.model, input: text });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({ model: this.model, input: texts });
    return response.data.map(d => d.embedding);
  }
}
