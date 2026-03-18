// packages/neo4j/src/provenance.ts
import { type Driver } from 'neo4j-driver';

export interface ProvenanceNode {
  id: string;
  label: string;
  content: string;
  relationship: string;
}

export class ProvenanceTraversal {
  constructor(private driver: Driver) {}

  async traceOrigin(semanticId: string): Promise<ProvenanceNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH path = (s:Semantic {id: $id})-[r:SUPERSEDES|PROMOTED_FROM*1..10]->(target)
         RETURN target, type(last(relationships(path))) AS relType, labels(target) AS nodeLabels`,
        { id: semanticId },
      );

      return result.records.map(record => {
        const target = record.get('target').properties as Record<string, unknown>;
        const relType = record.get('relType') as string;
        const nodeLabels = record.get('nodeLabels') as string[];
        return {
          id: target.id as string,
          label: nodeLabels[0] ?? 'Unknown',
          content: (target.content as string) ?? '',
          relationship: relType,
        };
      });
    } finally {
      await session.close();
    }
  }

  async supersessionHistory(
    semanticId: string,
  ): Promise<Array<{ id: string; content: string; confidence: number }>> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic {id: $id})-[:SUPERSEDES*1..10]->(old:Semantic)
         RETURN old
         ORDER BY old.updated_at DESC`,
        { id: semanticId },
      );

      return result.records.map(record => {
        const props = record.get('old').properties as Record<string, unknown>;
        return {
          id: props.id as string,
          content: (props.content as string) ?? '',
          confidence:
            typeof props.confidence === 'number'
              ? props.confidence
              : parseFloat(String(props.confidence ?? '0')),
        };
      });
    } finally {
      await session.close();
    }
  }
}
