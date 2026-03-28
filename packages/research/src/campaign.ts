// packages/research/src/campaign.ts
import neo4j, { type Driver } from 'neo4j-driver';
import type { CampaignNode } from './types.js';

const SAFE_PROPERTY_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class CampaignStore {
  constructor(private driver: Driver) {}

  async create(node: CampaignNode): Promise<string> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `CREATE (c:Entity:Campaign {
          id: $id,
          campaign_id: $campaign_id,
          name: $name,
          type: 'campaign',
          objective: $objective,
          metric_name: $metric_name,
          metric_direction: $metric_direction,
          run_command: $run_command,
          measure_command: $measure_command,
          scope_files: $scope_files,
          constraints: $constraints,
          baseline_metric: $baseline_metric,
          best_metric: $best_metric,
          best_commit: $best_commit,
          best_experiment_id: $best_experiment_id,
          total_experiments: $total_experiments,
          total_keeps: $total_keeps,
          total_discards: $total_discards,
          consolidation_count: $consolidation_count,
          last_consolidation_at: $last_consolidation_at,
          status: $status,
          created_at: $created_at,
          updated_at: $updated_at
        }) RETURN c.id AS id`,
        {
          id: node.id,
          campaign_id: node.campaign_id,
          name: node.name,
          objective: node.objective,
          metric_name: node.metric_name,
          metric_direction: node.metric_direction,
          run_command: node.run_command,
          measure_command: node.measure_command,
          scope_files: node.scope_files,
          constraints: node.constraints,
          baseline_metric: node.baseline_metric,
          best_metric: node.best_metric,
          best_commit: node.best_commit,
          best_experiment_id: node.best_experiment_id,
          total_experiments: node.total_experiments,
          total_keeps: node.total_keeps,
          total_discards: node.total_discards,
          consolidation_count: node.consolidation_count,
          last_consolidation_at: node.last_consolidation_at,
          status: node.status,
          created_at: node.created_at,
          updated_at: node.updated_at,
        },
      );
      return result.records[0].get('id') as string;
    } finally {
      await session.close();
    }
  }

  async getById(campaignId: string): Promise<CampaignNode | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (c:Campaign {campaign_id: $campaignId}) RETURN c',
        { campaignId },
      );
      if (result.records.length === 0) return null;
      return mapCampaignNode(result.records[0].get('c').properties);
    } finally {
      await session.close();
    }
  }

  async updateStats(
    campaignId: string,
    updates: {
      total_experiments?: number;
      total_keeps?: number;
      total_discards?: number;
      best_metric?: number;
      best_commit?: string;
      best_experiment_id?: string;
      baseline_metric?: number;
    },
  ): Promise<void> {
    const session = this.driver.session();
    try {
      const setClauses: string[] = ['c.updated_at = $now'];
      const params: Record<string, unknown> = {
        campaignId,
        now: new Date().toISOString(),
      };

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          if (!SAFE_PROPERTY_KEY.test(key)) {
            throw new Error(`Invalid property key: ${key}`);
          }
          setClauses.push(`c.${key} = $${key}`);
          params[key] = value;
        }
      }

      await session.run(
        `MATCH (c:Campaign {campaign_id: $campaignId}) SET ${setClauses.join(', ')}`,
        params,
      );
    } finally {
      await session.close();
    }
  }

  async incrementConsolidation(campaignId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (c:Campaign {campaign_id: $campaignId})
         SET c.consolidation_count = c.consolidation_count + 1,
             c.last_consolidation_at = $now,
             c.updated_at = $now`,
        { campaignId, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }

  async setStatus(campaignId: string, status: CampaignNode['status']): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (c:Campaign {campaign_id: $campaignId})
         SET c.status = $status, c.updated_at = $now`,
        { campaignId, status, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }

  async listActive(): Promise<CampaignNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (c:Campaign {status: 'active'})
         RETURN c ORDER BY c.updated_at DESC`,
      );
      return result.records.map((r) => mapCampaignNode(r.get('c').properties));
    } finally {
      await session.close();
    }
  }
}

function mapCampaignNode(props: Record<string, unknown>): CampaignNode {
  return {
    id: props.id as string,
    campaign_id: props.campaign_id as string,
    name: props.name as string,
    objective: props.objective as string,
    metric_name: props.metric_name as string,
    metric_direction: props.metric_direction as CampaignNode['metric_direction'],
    run_command: props.run_command as string,
    measure_command: props.measure_command as string,
    scope_files: (props.scope_files as string[]) ?? [],
    constraints: (props.constraints as string) ?? '',
    baseline_metric: props.baseline_metric as number | null,
    best_metric: props.best_metric as number | null,
    best_commit: props.best_commit as string | null,
    best_experiment_id: props.best_experiment_id as string | null,
    total_experiments: toNumber(props.total_experiments),
    total_keeps: toNumber(props.total_keeps),
    total_discards: toNumber(props.total_discards),
    consolidation_count: toNumber(props.consolidation_count),
    last_consolidation_at: props.last_consolidation_at as string | null,
    status: props.status as CampaignNode['status'],
    created_at: props.created_at as string,
    updated_at: props.updated_at as string,
  };
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}
