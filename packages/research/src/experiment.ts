// packages/research/src/experiment.ts
import neo4j, { type Driver } from 'neo4j-driver';
import type { ExperimentNode, ExperimentStats } from './types.js';

export class ExperimentStore {
  constructor(private driver: Driver) {}

  async create(node: ExperimentNode): Promise<string> {
    const session = this.driver.session();
    try {
      // Create with dual labels: Episodic (for AMP compat) + Experiment (for research queries)
      const result = await session.run(
        `CREATE (e:Episodic:Experiment {
          id: $id,
          session_id: $session_id,
          agent_id: $agent_id,
          campaign_id: $campaign_id,
          experiment_number: $experiment_number,
          branch: $branch,
          parent_id: $parent_id,
          commit_hash: $commit_hash,
          metric_name: $metric_name,
          metric_value: $metric_value,
          status: $status,
          duration_s: $duration_s,
          hypothesis: $hypothesis,
          description: $description,
          insight: $insight,
          components_touched: $components_touched,
          created_at: $created_at,
          task: $task,
          content: $content,
          outcome: $outcome
        }) RETURN e.id AS id`,
        {
          id: node.id,
          session_id: node.session_id,
          agent_id: node.agent_id,
          campaign_id: node.campaign_id,
          experiment_number: neo4j.int(node.experiment_number),
          branch: node.branch,
          parent_id: node.parent_id,
          commit_hash: node.commit_hash,
          metric_name: node.metric_name,
          metric_value: node.metric_value,
          status: node.status,
          duration_s: node.duration_s,
          hypothesis: node.hypothesis,
          description: node.description,
          insight: node.insight,
          components_touched: node.components_touched,
          created_at: node.created_at,
          // Map to Episodic-compatible fields
          task: `[${node.campaign_id}] experiment #${node.experiment_number}: ${node.description}`,
          content: [
            `Hypothesis: ${node.hypothesis}`,
            `Changes: ${node.description}`,
            `Result: ${node.metric_name}=${node.metric_value} (${node.status})`,
            `Insight: ${node.insight}`,
          ].join('\n'),
          outcome: node.status === 'keep' || node.status === 'keep*' ? 'approved' : 'revised',
        },
      );

      // Store secondary_metrics as JSON string (Neo4j doesn't support map properties)
      if (Object.keys(node.secondary_metrics).length > 0) {
        await session.run(
          'MATCH (e:Experiment {id: $id}) SET e.secondary_metrics = $sm',
          { id: node.id, sm: JSON.stringify(node.secondary_metrics) },
        );
      }

      if (node.embedding) {
        await session.run(
          'MATCH (e:Experiment {id: $id}) SET e.embedding = $embedding',
          { id: node.id, embedding: node.embedding },
        );
      }

      return result.records[0].get('id') as string;
    } finally {
      await session.close();
    }
  }

  async linkToParent(experimentId: string, parentId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (e:Experiment {id: $experimentId}), (parent:Experiment {id: $parentId})
         MERGE (e)-[:DERIVED_FROM]->(parent)`,
        { experimentId, parentId },
      );
    } finally {
      await session.close();
    }
  }

  async linkToComponent(
    experimentId: string,
    componentPath: string,
    componentDomain: string,
    outcome: string,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      const componentName = componentPath.split('/').pop() ?? componentPath;
      await session.run(
        `MATCH (e:Experiment {id: $experimentId})
         MERGE (c:Entity:Component {path: $path})
         ON CREATE SET c.id = randomUUID(), c.name = $name, c.type = 'component',
                       c.domain = $domain, c.created_at = $now
         CREATE (e)-[:MODIFIED {outcome: $outcome}]->(c)`,
        {
          experimentId,
          path: componentPath,
          name: componentName,
          domain: componentDomain,
          outcome,
          now: new Date().toISOString(),
        },
      );
    } finally {
      await session.close();
    }
  }

  async linkToCampaign(experimentId: string, campaignId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (e:Experiment {id: $experimentId}), (c:Campaign {campaign_id: $campaignId})
         MERGE (e)-[:BELONGS_TO]->(c)`,
        { experimentId, campaignId },
      );
    } finally {
      await session.close();
    }
  }

  async getById(id: string): Promise<ExperimentNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run('MATCH (e:Experiment {id: $id}) RETURN e', { id });
      if (result.records.length === 0) return null;
      return mapExperimentNode(result.records[0].get('e').properties);
    } finally {
      await session.close();
    }
  }

  async getByCampaign(campaignId: string, limit = 100): Promise<ExperimentNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})
         RETURN e ORDER BY e.experiment_number ASC LIMIT $limit`,
        { campaignId, limit: neo4j.int(limit) },
      );
      return result.records.map((r) => mapExperimentNode(r.get('e').properties));
    } finally {
      await session.close();
    }
  }

  async getRecentKeeps(campaignId: string, limit = 10): Promise<ExperimentNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})
         WHERE e.status IN ['keep', 'keep*']
         RETURN e ORDER BY e.experiment_number DESC LIMIT $limit`,
        { campaignId, limit: neo4j.int(limit) },
      );
      return result.records.map((r) => mapExperimentNode(r.get('e').properties));
    } finally {
      await session.close();
    }
  }

  async getByComponent(componentPath: string, campaignId?: string): Promise<ExperimentNode[]> {
    const session = this.driver.session();
    try {
      const cypher = campaignId
        ? `MATCH (e:Experiment)-[:MODIFIED]->(c:Component {path: $path})
           WHERE e.campaign_id = $campaignId
           RETURN e ORDER BY e.experiment_number DESC`
        : `MATCH (e:Experiment)-[:MODIFIED]->(c:Component {path: $path})
           RETURN e ORDER BY e.experiment_number DESC`;
      const params: Record<string, unknown> = { path: componentPath };
      if (campaignId) params.campaignId = campaignId;
      const result = await session.run(cypher, params);
      return result.records.map((r) => mapExperimentNode(r.get('e').properties));
    } finally {
      await session.close();
    }
  }

  async getStats(campaignId: string): Promise<ExperimentStats> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})
         RETURN
           count(e) AS total,
           count(CASE WHEN e.status IN ['keep', 'keep*'] THEN 1 END) AS keeps,
           count(CASE WHEN e.status = 'discard' THEN 1 END) AS discards,
           count(CASE WHEN e.status IN ['crash', 'timeout'] THEN 1 END) AS crashes,
           count(CASE WHEN e.status = 'thought' THEN 1 END) AS thoughts,
           count(CASE WHEN e.status = 'interesting' THEN 1 END) AS interesting`,
        { campaignId },
      );
      if (result.records.length === 0) {
        return { total: 0, keeps: 0, discards: 0, crashes: 0, thoughts: 0, interesting: 0 };
      }
      const r = result.records[0];
      return {
        total: toNum(r.get('total')),
        keeps: toNum(r.get('keeps')),
        discards: toNum(r.get('discards')),
        crashes: toNum(r.get('crashes')),
        thoughts: toNum(r.get('thoughts')),
        interesting: toNum(r.get('interesting')),
      };
    } finally {
      await session.close();
    }
  }

  async getDeadEnds(campaignId: string, minDiscards = 3): Promise<
    Array<{ component: string; domain: string; discard_count: number; last_attempt: string; descriptions: string[] }>
  > {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})-[:MODIFIED]->(c:Component)
         WHERE e.status = 'discard'
         WITH c, count(e) AS discardCount,
              max(e.created_at) AS lastAttempt,
              collect(e.description)[0..5] AS descriptions
         WHERE discardCount >= $minDiscards
         RETURN c.path AS component, c.domain AS domain,
                discardCount, lastAttempt, descriptions
         ORDER BY discardCount DESC`,
        { campaignId, minDiscards: neo4j.int(minDiscards) },
      );
      return result.records.map((r) => ({
        component: r.get('component') as string,
        domain: (r.get('domain') as string) ?? 'unknown',
        discard_count: toNum(r.get('discardCount')),
        last_attempt: r.get('lastAttempt') as string,
        descriptions: r.get('descriptions') as string[],
      }));
    } finally {
      await session.close();
    }
  }
}

// === Helpers ===

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}

function mapExperimentNode(props: Record<string, unknown>): ExperimentNode {
  return {
    id: props.id as string,
    session_id: props.session_id as string,
    agent_id: props.agent_id as string,
    campaign_id: props.campaign_id as string,
    experiment_number: toNum(props.experiment_number),
    branch: props.branch as string,
    parent_id: (props.parent_id as string) ?? null,
    commit_hash: (props.commit_hash as string) ?? null,
    metric_name: props.metric_name as string,
    metric_value: props.metric_value as number,
    secondary_metrics: props.secondary_metrics
      ? JSON.parse(props.secondary_metrics as string)
      : {},
    status: props.status as ExperimentNode['status'],
    duration_s: props.duration_s as number,
    hypothesis: (props.hypothesis as string) ?? '',
    description: (props.description as string) ?? '',
    insight: (props.insight as string) ?? '',
    components_touched: (props.components_touched as string[]) ?? [],
    created_at: props.created_at as string,
    embedding: props.embedding != null ? (props.embedding as number[]) : undefined,
  };
}
