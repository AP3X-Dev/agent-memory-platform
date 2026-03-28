// packages/research/src/contradictions.ts
// Detects conflicting semantic claims within a research campaign.

import { type Driver } from 'neo4j-driver';
import type { Contradiction } from './types.js';

export class ContradictionDetector {
  constructor(private driver: Driver) {}

  /**
   * Find semantic nodes that have conflicting evidence from experiments.
   *
   * A contradiction is detected when:
   * 1. Two semantic nodes in the same domain make opposing claims
   *    (one has VALIDATES, the other has REFUTES from the same component area)
   * 2. A semantic node has both REINFORCES and CONTRADICTS signals from experiments
   */
  async detect(campaignId: string): Promise<Contradiction[]> {
    const session = this.driver.session();
    try {
      const contradictions: Contradiction[] = [];

      // Pattern 1: Explicit CONTRADICTS edges between Semantics
      const explicit = await session.run(
        `MATCH (a:Semantic)-[:CONTRADICTS]->(b:Semantic)
         WHERE ANY(t IN a.tags WHERE t = $campaignTag OR t = 'research')
           AND ANY(t IN b.tags WHERE t = $campaignTag OR t = 'research')
         RETURN a, b
         ORDER BY a.confidence DESC`,
        { campaignTag: `campaign:${campaignId}` },
      );

      for (const record of explicit.records) {
        const a = record.get('a').properties as Record<string, unknown>;
        const b = record.get('b').properties as Record<string, unknown>;
        contradictions.push({
          principle_a: {
            id: a.id as string,
            claim: a.content as string,
            confidence: a.confidence as number,
          },
          principle_b: {
            id: b.id as string,
            claim: b.content as string,
            confidence: b.confidence as number,
          },
          reason: 'Explicit contradiction edge',
        });
      }

      // Pattern 2: Same semantic node has both reinforcement and contradiction signals
      const conflicted = await session.run(
        `MATCH (s:Semantic)
         WHERE ANY(t IN s.tags WHERE t = $campaignTag OR t = 'research')
         OPTIONAL MATCH (reinforce:Episodic)-[:REINFORCES]->(s)
         WHERE reinforce.campaign_id = $campaignId
         WITH s, count(reinforce) AS reinforceCount
         OPTIONAL MATCH (contradict:Episodic)-[:CONTRADICTS]->(s)
         WHERE contradict.campaign_id = $campaignId
         WITH s, reinforceCount, count(contradict) AS contradictCount
         WHERE reinforceCount > 0 AND contradictCount > 0
         RETURN s, reinforceCount, contradictCount
         ORDER BY contradictCount DESC`,
        { campaignId, campaignTag: `campaign:${campaignId}` },
      );

      for (const record of conflicted.records) {
        const s = record.get('s').properties as Record<string, unknown>;
        const rCount = toNum(record.get('reinforceCount'));
        const cCount = toNum(record.get('contradictCount'));
        contradictions.push({
          principle_a: {
            id: s.id as string,
            claim: s.content as string,
            confidence: s.confidence as number,
          },
          principle_b: {
            id: s.id as string,
            claim: `[Self-contradicted] ${s.content as string}`,
            confidence: s.confidence as number,
          },
          reason: `${rCount} reinforcements vs ${cCount} contradictions from experiments`,
        });
      }

      return contradictions;
    } finally {
      await session.close();
    }
  }

  /**
   * Find semantic nodes with low confidence that could benefit from
   * targeted experiments to resolve uncertainty.
   */
  async findUncertain(
    campaignId: string,
    maxConfidence = 0.5,
  ): Promise<Array<{ id: string; claim: string; confidence: number; domain: string }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)
         WHERE ANY(t IN s.tags WHERE t = $campaignTag OR t = 'research')
           AND s.confidence <= $maxConfidence
           AND s.confidence > 0.1
         RETURN s.id AS id, s.content AS claim, s.confidence AS confidence,
                COALESCE(head([t IN s.tags WHERE t <> $campaignTag AND t <> 'research']), 'general') AS domain
         ORDER BY s.confidence ASC`,
        { campaignTag: `campaign:${campaignId}`, maxConfidence },
      );
      return result.records.map((r) => ({
        id: r.get('id') as string,
        claim: r.get('claim') as string,
        confidence: r.get('confidence') as number,
        domain: r.get('domain') as string,
      }));
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
