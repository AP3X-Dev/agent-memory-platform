// packages/retrieval/src/feedback.ts
// Usage feedback tracking — makes retrieval improve over time without ML.
// Tracks which results agents actually use, boosts those in future queries.

import type { FeedbackSignal, BoostFactors, SourceType } from './types.js';

// ─── Redis interface (injected, not concrete) ─────────────────────────────────

export interface FeedbackRedisLayer {
  zincrby(key: string, increment: number, member: string): Promise<number>;
  zrevrangeWithScores(key: string, start: number, stop: number): Promise<Array<{ member: string; score: number }>>;
  lpush(key: string, value: string): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
}

// ─── Feedback tracker ────────────────────────────────────────────────────────

const FEEDBACK_PREFIX = 'amp:feedback';
const ENTITY_BOOST_KEY = `${FEEDBACK_PREFIX}:entity_boost`;
const SOURCE_BOOST_KEY = `${FEEDBACK_PREFIX}:source_boost`;
const FEEDBACK_LOG_KEY = `${FEEDBACK_PREFIX}:log`;
const MAX_LOG_SIZE = 10000;

export class FeedbackTracker {
  constructor(private redis: FeedbackRedisLayer) {}

  /**
   * Record that a result was used (or ignored) by an agent.
   * Positive feedback boosts the entity and source type for future queries.
   */
  async recordFeedback(signal: FeedbackSignal): Promise<void> {
    const increment = signal.was_useful ? 1 : -0.5;

    // Boost the entities mentioned in the result
    const entityNames = extractEntityNames(signal.query);
    for (const entity of entityNames) {
      await this.redis.zincrby(ENTITY_BOOST_KEY, increment, entity);
    }

    // Boost the source type
    await this.redis.zincrby(SOURCE_BOOST_KEY, increment, signal.source_type);

    // Log the feedback event
    await this.redis.lpush(FEEDBACK_LOG_KEY, JSON.stringify(signal));
    await this.redis.ltrim(FEEDBACK_LOG_KEY, 0, MAX_LOG_SIZE - 1);
  }

  /**
   * Get current boost factors for RRF fusion.
   * Returns normalized boosts (0.0–1.0 range) for entities and source types.
   */
  async getBoosts(): Promise<BoostFactors> {
    // Top 50 entity boosts
    const entityScores = await this.redis.zrevrangeWithScores(ENTITY_BOOST_KEY, 0, 49);
    const maxEntityScore = entityScores.length > 0 ? entityScores[0].score : 1;

    const entity_boosts: Record<string, number> = {};
    for (const { member, score } of entityScores) {
      if (score > 0) {
        entity_boosts[member] = Math.min(1.0, score / Math.max(maxEntityScore, 1));
      }
    }

    // Source type boosts
    const sourceScores = await this.redis.zrevrangeWithScores(SOURCE_BOOST_KEY, 0, 10);
    const maxSourceScore = sourceScores.length > 0 ? sourceScores[0].score : 1;

    const source_type_boosts: Record<SourceType, number> = {
      semantic: 0,
      episodic: 0,
      symbol: 0,
      arch_entity: 0,
      aspect: 0,
    };
    for (const { member, score } of sourceScores) {
      if (score > 0 && member in source_type_boosts) {
        source_type_boosts[member as SourceType] = Math.min(0.5, score / Math.max(maxSourceScore, 1) * 0.5);
      }
    }

    return { entity_boosts, source_type_boosts };
  }

  /**
   * Infer feedback from agent behavior: if a result_id appears in a subsequent
   * amp_store content, the agent used it.
   */
  async inferUsage(storeContent: string, recentResultIds: string[], sessionId: string): Promise<number> {
    let usageCount = 0;
    for (const resultId of recentResultIds) {
      // Simple heuristic: if the result ID or a key term from the result appears in store content
      const shortId = resultId.slice(0, 8);
      const wasUsed = storeContent.includes(shortId) || storeContent.includes(resultId);
      if (wasUsed) {
        await this.recordFeedback({
          query: '',
          result_id: resultId,
          source_type: 'semantic',
          was_useful: true,
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        });
        usageCount++;
      }
    }
    return usageCount;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEntityNames(text: string): string[] {
  // Extract potential entity names: capitalized words, kebab-case, snake_case identifiers
  const patterns = text.match(/[A-Z][a-zA-Z]+|[a-z]+(?:-[a-z]+)+|[a-z]+(?:_[a-z]+)+/g) ?? [];
  return [...new Set(patterns)].slice(0, 10);
}
