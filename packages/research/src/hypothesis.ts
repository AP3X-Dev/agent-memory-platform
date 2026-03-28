// packages/research/src/hypothesis.ts
// Cypher-powered traversals of the experiment hypothesis tree.

import neo4j, { type Driver } from 'neo4j-driver';
import type { HypothesisTreeNode, ExperimentStatus } from './types.js';

export class HypothesisNavigator {
  constructor(private driver: Driver) {}

  /**
   * Build the full hypothesis tree for a campaign.
   * Root nodes are experiments with no parent (parent_id IS NULL).
   */
  async getTree(campaignId: string): Promise<HypothesisTreeNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})
         OPTIONAL MATCH (e)-[:DERIVED_FROM]->(parent:Experiment)
         RETURN e, parent.id AS parentId
         ORDER BY e.experiment_number ASC`,
        { campaignId },
      );

      const nodes = new Map<string, HypothesisTreeNode & { parentId: string | null }>();
      for (const record of result.records) {
        const props = record.get('e').properties as Record<string, unknown>;
        const parentId = record.get('parentId') as string | null;
        nodes.set(props.id as string, {
          id: props.id as string,
          experiment_number: toNum(props.experiment_number),
          description: (props.description as string) ?? '',
          status: props.status as ExperimentStatus,
          metric_value: props.metric_value as number,
          branch: props.branch as string,
          depth: 0,
          children: [],
          parentId,
        });
      }

      const roots: HypothesisTreeNode[] = [];
      for (const node of nodes.values()) {
        if (node.parentId && nodes.has(node.parentId)) {
          const parent = nodes.get(node.parentId)!;
          node.depth = parent.depth + 1;
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }

      return roots;
    } finally {
      await session.close();
    }
  }

  /**
   * Find all experiments that touched a specific component with a given status.
   */
  async findByComponent(
    campaignId: string,
    componentPath: string,
    status?: string,
  ): Promise<Array<{ id: string; experiment_number: number; description: string; status: ExperimentStatus; metric_value: number }>> {
    const session = this.driver.session();
    try {
      const statusFilter = status ? 'AND e.status = $status' : '';
      const result = await session.run(
        `MATCH (e:Experiment {campaign_id: $campaignId})-[:MODIFIED]->(c:Component {path: $path})
         WHERE true ${statusFilter}
         RETURN e.id AS id, e.experiment_number AS num, e.description AS desc,
                e.status AS status, e.metric_value AS metric
         ORDER BY e.experiment_number ASC`,
        { campaignId, path: componentPath, status: status ?? null },
      );
      return result.records.map((r) => ({
        id: r.get('id') as string,
        experiment_number: toNum(r.get('num')),
        description: r.get('desc') as string,
        status: r.get('status') as ExperimentStatus,
        metric_value: r.get('metric') as number,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Render the hypothesis tree as indented markdown for the agent's context.
   */
  renderTreeMarkdown(roots: HypothesisTreeNode[]): string {
    const lines: string[] = ['# Hypothesis Tree', ''];

    function walk(node: HypothesisTreeNode, indent: number): void {
      const prefix = '  '.repeat(indent);
      const statusIcon =
        node.status === 'keep' || node.status === 'keep*' ? '+'
        : node.status === 'discard' ? '-'
        : node.status === 'crash' || node.status === 'timeout' ? '!'
        : node.status === 'thought' ? '?'
        : '~';
      lines.push(
        `${prefix}[${statusIcon}] #${node.experiment_number} ${node.description} (${node.metric_value}) [${node.branch}]`,
      );
      for (const child of node.children) {
        walk(child, indent + 1);
      }
    }

    for (const root of roots) {
      walk(root, 0);
    }

    return lines.join('\n');
  }
}

function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val != null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}
