// packages/research/src/consolidation.ts
// Research-specific consolidation: detects patterns in experiment history
// and promotes them to semantic nodes.

import { nanoid } from 'nanoid';
import neo4j, { type Driver } from 'neo4j-driver';
import type {
  ConsolidationPattern,
  ResearchConsolidationResult,
  PatternType,
} from './types.js';

export class ResearchConsolidation {
  constructor(private driver: Driver) {}

  /**
   * Run consolidation for a campaign. Detects patterns across experiments
   * and creates/updates semantic nodes.
   *
   * Call this every N experiments (default 10) or on session wrap-up.
   */
  async run(campaignId: string): Promise<ResearchConsolidationResult> {
    const patterns = await this.detectPatterns(campaignId);
    const result: ResearchConsolidationResult = {
      patterns_detected: patterns.length,
      semantic_created: [],
      semantic_updated: [],
      confidence_changes: [],
      procedural_updates: [],
    };

    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'component_leverage':
        case 'combo_synergy':
        case 'exhausted_direction':
        case 'crash_pattern': {
          // Create new semantic principle
          const created = await this.createSemanticFromPattern(campaignId, pattern);
          if (created) result.semantic_created.push(created);
          break;
        }
        case 'confirmed_principle': {
          // Raise confidence on existing semantic
          const updated = await this.reinforceSemantic(pattern);
          if (updated) {
            result.semantic_updated.push(updated.id);
            result.confidence_changes.push(updated);
          }
          break;
        }
        case 'contradicted_principle': {
          // Lower confidence on existing semantic
          const updated = await this.weakenSemantic(pattern);
          if (updated) {
            result.semantic_updated.push(updated.id);
            result.confidence_changes.push(updated);
          }
          break;
        }
      }
    }

    return result;
  }

  /**
   * Detect patterns across all experiments in a campaign.
   */
  async detectPatterns(campaignId: string): Promise<ConsolidationPattern[]> {
    const patterns: ConsolidationPattern[] = [];

    const [leverage, exhausted, crashes, synergies] = await Promise.all([
      this.detectComponentLeverage(campaignId),
      this.detectExhaustedDirections(campaignId),
      this.detectCrashPatterns(campaignId),
      this.detectComboSynergies(campaignId),
    ]);

    patterns.push(...leverage, ...exhausted, ...crashes, ...synergies);

    // Detect confirmations/contradictions of existing semantics
    const semanticUpdates = await this.detectSemanticUpdates(campaignId);
    patterns.push(...semanticUpdates);

    return patterns;
  }

  /**
   * Components with 2+ keeps → "this area has leverage"
   */
  private async detectComponentLeverage(campaignId: string): Promise<ConsolidationPattern[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})-[:MODIFIED]->(c:Component)
         WHERE e.status IN ['keep', 'keep*']
         WITH c, collect(e.id) AS expIds, count(e) AS keepCount,
              collect(e.description) AS descriptions
         WHERE keepCount >= 2
         RETURN c.path AS path, c.domain AS domain, keepCount, expIds, descriptions`,
        { campaignId },
      );

      return result.records.map((r) => ({
        type: 'component_leverage' as PatternType,
        description: `Component "${r.get('path')}" (${r.get('domain')}) has ${toNum(r.get('keepCount'))} successful experiments: ${(r.get('descriptions') as string[]).slice(0, 3).join('; ')}`,
        evidence_ids: r.get('expIds') as string[],
        confidence: Math.min(0.8, 0.4 + toNum(r.get('keepCount')) * 0.1),
        suggested_action: `Explore "${r.get('path')}" further — this area responds well to changes`,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Components with 3+ discards in a row → "this direction is exhausted"
   */
  private async detectExhaustedDirections(campaignId: string): Promise<ConsolidationPattern[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})-[:MODIFIED]->(c:Component)
         WHERE e.status = 'discard'
         WITH c, collect(e.id) AS expIds, count(e) AS discardCount,
              collect(e.description) AS descriptions
         WHERE discardCount >= 3
         RETURN c.path AS path, c.domain AS domain, discardCount, expIds, descriptions`,
        { campaignId },
      );

      return result.records.map((r) => ({
        type: 'exhausted_direction' as PatternType,
        description: `Component "${r.get('path')}" has ${toNum(r.get('discardCount'))} discarded experiments. Approaches tried: ${(r.get('descriptions') as string[]).slice(0, 3).join('; ')}`,
        evidence_ids: r.get('expIds') as string[],
        confidence: Math.min(0.85, 0.5 + toNum(r.get('discardCount')) * 0.1),
        suggested_action: `Avoid further changes to "${r.get('path')}" unless via a radically different approach`,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Components that consistently crash → procedural gotcha
   */
  private async detectCrashPatterns(campaignId: string): Promise<ConsolidationPattern[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})-[:MODIFIED]->(c:Component)
         WHERE e.status IN ['crash', 'timeout']
         WITH c, collect(e.id) AS expIds, count(e) AS crashCount,
              collect(e.description) AS descriptions
         WHERE crashCount >= 2
         RETURN c.path AS path, c.domain AS domain, crashCount, expIds, descriptions`,
        { campaignId },
      );

      return result.records.map((r) => ({
        type: 'crash_pattern' as PatternType,
        description: `Component "${r.get('path')}" causes crashes/timeouts (${toNum(r.get('crashCount'))} times). Changes: ${(r.get('descriptions') as string[]).slice(0, 3).join('; ')}`,
        evidence_ids: r.get('expIds') as string[],
        confidence: 0.7,
        suggested_action: `Approach "${r.get('path')}" with extreme caution — known crash risk`,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Pairs of components that were changed together in keeps → synergy
   */
  private async detectComboSynergies(campaignId: string): Promise<ConsolidationPattern[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})-[:MODIFIED]->(c1:Component)
         MATCH (e)-[:MODIFIED]->(c2:Component)
         WHERE e.status IN ['keep', 'keep*'] AND c1.path < c2.path
         WITH c1, c2, collect(e.id) AS expIds, count(e) AS comboCount
         WHERE comboCount >= 2
         RETURN c1.path AS path1, c2.path AS path2, comboCount, expIds`,
        { campaignId },
      );

      return result.records.map((r) => ({
        type: 'combo_synergy' as PatternType,
        description: `"${r.get('path1')}" + "${r.get('path2')}" changed together in ${toNum(r.get('comboCount'))} successful experiments`,
        evidence_ids: r.get('expIds') as string[],
        confidence: Math.min(0.75, 0.4 + toNum(r.get('comboCount')) * 0.15),
        suggested_action: `These components may have synergistic effects — try combining changes`,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Check if recent experiments confirm or contradict existing semantic nodes.
   */
  private async detectSemanticUpdates(campaignId: string): Promise<ConsolidationPattern[]> {
    const session = this.driver.session();
    try {
      // Find semantic nodes that recent experiments relate to
      const result = await session.run(
        `MATCH (s:Semantic)
         WHERE ANY(t IN s.tags WHERE t = $campaignTag OR t = 'research')
         OPTIONAL MATCH (keep:Experiment {campaign_id: $campaignId, status: 'keep'})-[:MODIFIED]->(c:Component)
         WHERE c.domain IN [t IN s.tags WHERE t <> $campaignTag AND t <> 'research']
         WITH s, count(keep) AS keepCount
         OPTIONAL MATCH (discard:Experiment {campaign_id: $campaignId, status: 'discard'})-[:MODIFIED]->(c2:Component)
         WHERE c2.domain IN [t IN s.tags WHERE t <> $campaignTag AND t <> 'research']
         WITH s, keepCount, count(discard) AS discardCount
         WHERE keepCount > 0 OR discardCount > 0
         RETURN s.id AS id, s.content AS claim, s.confidence AS confidence,
                keepCount, discardCount`,
        { campaignId, campaignTag: `campaign:${campaignId}` },
      );

      const patterns: ConsolidationPattern[] = [];
      for (const record of result.records) {
        const keeps = toNum(record.get('keepCount'));
        const discards = toNum(record.get('discardCount'));
        const id = record.get('id') as string;
        const claim = record.get('claim') as string;

        if (keeps > discards && keeps >= 2) {
          patterns.push({
            type: 'confirmed_principle',
            description: `Principle "${claim}" confirmed by ${keeps} successful experiments`,
            evidence_ids: [id],
            confidence: Math.min(0.95, (record.get('confidence') as number) + 0.1),
            suggested_action: `Exploit this principle — high confidence`,
          });
        } else if (discards > keeps && discards >= 2) {
          patterns.push({
            type: 'contradicted_principle',
            description: `Principle "${claim}" contradicted by ${discards} failed experiments`,
            evidence_ids: [id],
            confidence: Math.max(0.1, (record.get('confidence') as number) - 0.15),
            suggested_action: `Re-evaluate this principle — evidence is weakening`,
          });
        }
      }

      return patterns;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a new Semantic node from a detected pattern.
   */
  private async createSemanticFromPattern(
    campaignId: string,
    pattern: ConsolidationPattern,
  ): Promise<string | null> {
    const session = this.driver.session();
    try {
      const id = `sem-research-${nanoid(10)}`;
      const now = new Date().toISOString();

      await session.run(
        `CREATE (s:Semantic {
          id: $id,
          content: $content,
          confidence: $confidence,
          signal_count: $signalCount,
          created_at: $now,
          updated_at: $now,
          decay_class: 'stable',
          tags: $tags
        })`,
        {
          id,
          content: pattern.description,
          confidence: pattern.confidence,
          signalCount: neo4j.int(pattern.evidence_ids.length),
          now,
          tags: [`campaign:${campaignId}`, 'research', pattern.type],
        },
      );

      // Link to source experiments
      for (const expId of pattern.evidence_ids) {
        await session.run(
          `MATCH (s:Semantic {id: $semId}), (e:Experiment {id: $expId})
           CREATE (s)-[:DERIVED_FROM {via: 'consolidation'}]->(e)`,
          { semId: id, expId },
        );
      }

      return id;
    } catch (err: unknown) {
      console.error("[consolidation] Suppressed error:", err);
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Raise confidence on an existing semantic node.
   */
  private async reinforceSemantic(
    pattern: ConsolidationPattern,
  ): Promise<{ id: string; from: number; to: number } | null> {
    const targetId = pattern.evidence_ids[0];
    if (!targetId) return null;

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic {id: $id})
         WITH s, s.confidence AS oldConf
         SET s.confidence = CASE WHEN s.confidence + 0.1 > 0.95 THEN 0.95 ELSE s.confidence + 0.1 END,
             s.signal_count = s.signal_count + 1,
             s.updated_at = $now
         RETURN s.id AS id, oldConf, s.confidence AS newConf`,
        { id: targetId, now: new Date().toISOString() },
      );

      if (result.records.length === 0) return null;
      const r = result.records[0];
      return {
        id: r.get('id') as string,
        from: r.get('oldConf') as number,
        to: r.get('newConf') as number,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Lower confidence on an existing semantic node.
   */
  private async weakenSemantic(
    pattern: ConsolidationPattern,
  ): Promise<{ id: string; from: number; to: number } | null> {
    const targetId = pattern.evidence_ids[0];
    if (!targetId) return null;

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic {id: $id})
         WITH s, s.confidence AS oldConf
         SET s.confidence = CASE WHEN s.confidence - 0.15 < 0.05 THEN 0.05 ELSE s.confidence - 0.15 END,
             s.signal_count = s.signal_count + 1,
             s.updated_at = $now
         RETURN s.id AS id, oldConf, s.confidence AS newConf`,
        { id: targetId, now: new Date().toISOString() },
      );

      if (result.records.length === 0) return null;
      const r = result.records[0];
      return {
        id: r.get('id') as string,
        from: r.get('oldConf') as number,
        to: r.get('newConf') as number,
      };
    } finally {
      await session.close();
    }
  }
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}
