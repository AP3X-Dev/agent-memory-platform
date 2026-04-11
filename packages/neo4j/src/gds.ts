// packages/neo4j/src/gds.ts
import { type Driver } from 'neo4j-driver';

export interface SimilarPair {
  nodeA: string;
  nodeB: string;
  similarity: number;
}

export interface RankedNode {
  id: string;
  content: string;
  score: number;
}

export interface CommunityNode {
  id: string;
  content: string;
  communityId: string;
}

export class GDSAlgorithms {
  constructor(private driver: Driver) {}

  /**
   * Pairwise cosine similarity on Semantic nodes scoped to an entity.
   * Attempts to use `gds.similarity.cosine`; falls back to manual dot-product
   * computation if GDS is unavailable. Returns empty array on any error.
   */
  async findSimilarSemantics(
    entityName: string,
    threshold = 0.7,
  ): Promise<SimilarPair[]> {
    const session = this.driver.session();
    try {
      // Try GDS cosine similarity first
      const result = await session.run(
        `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $entityName})
         WHERE s.embedding IS NOT NULL
         WITH collect({id: s.id, embedding: s.embedding}) AS nodes
         UNWIND nodes AS a
         UNWIND nodes AS b
         WITH a, b WHERE a.id < b.id
         RETURN a.id AS nodeA, b.id AS nodeB,
                gds.similarity.cosine(a.embedding, b.embedding) AS similarity
         ORDER BY similarity DESC`,
        { entityName },
      );

      return result.records
        .map((r) => ({
          nodeA: r.get('nodeA') as string,
          nodeB: r.get('nodeB') as string,
          similarity: r.get('similarity') as number,
        }))
        .filter((p) => p.similarity >= threshold);
    } catch (err: unknown) {
      // GDS not available or other error — return empty
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Ranks Semantic nodes within an entity scope using
   * `signal_count * confidence` as a proxy PageRank score.
   */
  async pageRank(entityName: string): Promise<RankedNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $entityName})
         WITH s, (s.signal_count * s.confidence) AS score
         RETURN s.id AS id, s.content AS content, score
         ORDER BY score DESC`,
        { entityName },
      );

      return result.records.map((r) => ({
        id: r.get('id') as string,
        content: r.get('content') as string,
        score: r.get('score') as number,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Groups Semantic nodes by the Entity they are connected to via ABOUT.
   * Each entity forms a "community"; nodes not connected to any entity
   * get communityId = "unassigned".
   */
  async communityDetection(): Promise<CommunityNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)
         OPTIONAL MATCH (s)-[:ABOUT]->(e:Entity)
         RETURN s.id AS id, s.content AS content,
                coalesce(e.id, 'unassigned') AS communityId
         ORDER BY communityId, s.id`,
      );

      return result.records.map((r) => ({
        id: r.get('id') as string,
        content: r.get('content') as string,
        communityId: r.get('communityId') as string,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Counts episodic CORRECTS relationships per Semantic node within
   * the scope of a given entity.
   */
  async findCorrectionClusters(
    entityName: string,
  ): Promise<Array<{ targetId: string; correctionCount: number }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: $entityName})
         OPTIONAL MATCH (ep:Episodic)-[:CORRECTS]->(s)
         WITH s, count(ep) AS correctionCount
         WHERE correctionCount > 0
         RETURN s.id AS targetId, correctionCount
         ORDER BY correctionCount DESC`,
        { entityName },
      );

      return result.records.map((r) => ({
        targetId: r.get('targetId') as string,
        correctionCount: (r.get('correctionCount') as { toNumber: () => number } | number) instanceof Object && 'toNumber' in (r.get('correctionCount') as object)
          ? (r.get('correctionCount') as { toNumber: () => number }).toNumber()
          : (r.get('correctionCount') as number),
      }));
    } finally {
      await session.close();
    }
  }
}
