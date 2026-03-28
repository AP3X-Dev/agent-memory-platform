// packages/research/src/context.ts
// Builds dynamic research context (the "smart program.md") from the graph.

import type { Driver } from 'neo4j-driver';
import type { ResearchContext, SemanticPrinciple, Contradiction } from './types.js';
import { CampaignStore } from './campaign.js';
import { ExperimentStore } from './experiment.js';
import { ContradictionDetector } from './contradictions.js';

export class ResearchContextBuilder {
  private campaigns: CampaignStore;
  private experiments: ExperimentStore;
  private contradictions: ContradictionDetector;

  constructor(private driver: Driver) {
    this.campaigns = new CampaignStore(driver);
    this.experiments = new ExperimentStore(driver);
    this.contradictions = new ContradictionDetector(driver);
  }

  /**
   * Assemble full research context for a campaign.
   * This is what gets handed to the agent at the start of every THINK phase.
   */
  async build(campaignId: string): Promise<ResearchContext> {
    const campaign = await this.campaigns.getById(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const [
      semantics,
      recentKeeps,
      deadEnds,
      contradictionPairs,
      stats,
    ] = await Promise.all([
      this.getSemanticPrinciples(campaignId),
      this.experiments.getRecentKeeps(campaignId, 10),
      this.experiments.getDeadEnds(campaignId, 2),
      this.contradictions.detect(campaignId),
      this.experiments.getStats(campaignId),
    ]);

    return {
      campaign,
      semantic_principles: semantics,
      recent_keeps: recentKeeps.map((e) => ({
        id: e.id,
        experiment_number: e.experiment_number,
        description: e.description,
        metric_value: e.metric_value,
        branch: e.branch,
        insight: e.insight,
        created_at: e.created_at,
      })),
      dead_ends: deadEnds,
      contradictions: contradictionPairs,
      experiment_stats: stats,
      parking_lot: [], // Parking lot stays in .lab/ — filesystem-local
    };
  }

  /**
   * Render context as markdown for the agent's context window.
   */
  async renderMarkdown(campaignId: string, maxTokens = 4000): Promise<string> {
    const ctx = await this.build(campaignId);
    const lines: string[] = [];

    // Header
    lines.push(`# Research Context — ${ctx.campaign.name}`);
    lines.push('');
    lines.push(`**Objective:** ${ctx.campaign.objective}`);
    lines.push(`**Metric:** ${ctx.campaign.metric_name} (${ctx.campaign.metric_direction} is better)`);
    lines.push(`**Baseline:** ${ctx.campaign.baseline_metric ?? 'pending'}`);
    lines.push(`**Current best:** ${ctx.campaign.best_metric ?? 'pending'}`);
    lines.push('');

    // Stats
    const s = ctx.experiment_stats;
    lines.push(`## Progress`);
    lines.push(`Total: ${s.total} | Keeps: ${s.keeps} | Discards: ${s.discards} | Crashes: ${s.crashes} | Thoughts: ${s.thoughts}`);
    lines.push('');

    // Semantic principles (most valuable section)
    if (ctx.semantic_principles.length > 0) {
      lines.push('## Known Principles');
      lines.push('');
      for (const p of ctx.semantic_principles) {
        lines.push(`- **[${p.confidence.toFixed(2)}]** ${p.claim} _(${p.domain}, ${p.experiment_count} experiments)_`);
      }
      lines.push('');
    }

    // Recent keeps
    if (ctx.recent_keeps.length > 0) {
      lines.push('## Recent Wins');
      lines.push('');
      for (const k of ctx.recent_keeps) {
        lines.push(`- #${k.experiment_number}: ${k.description} → ${k.metric_value} | _${k.insight}_`);
      }
      lines.push('');
    }

    // Dead ends
    if (ctx.dead_ends.length > 0) {
      lines.push('## Dead Ends (avoid re-exploring)');
      lines.push('');
      for (const d of ctx.dead_ends) {
        lines.push(`- **${d.component}** (${d.domain}): ${d.discard_count} discards. Last: ${d.descriptions[0] ?? 'n/a'}`);
      }
      lines.push('');
    }

    // Contradictions
    if (ctx.contradictions.length > 0) {
      lines.push('## Unresolved Contradictions');
      lines.push('');
      for (const c of ctx.contradictions) {
        lines.push(`- **A** [${c.principle_a.confidence.toFixed(2)}]: ${c.principle_a.claim}`);
        lines.push(`  **B** [${c.principle_b.confidence.toFixed(2)}]: ${c.principle_b.claim}`);
        lines.push(`  _${c.reason}_`);
        lines.push('');
      }
    }

    // Truncate if needed (rough token estimate: 4 chars per token)
    let md = lines.join('\n');
    const estimatedTokens = Math.ceil(md.length / 4);
    if (estimatedTokens > maxTokens) {
      const maxChars = maxTokens * 4;
      md = md.slice(0, maxChars) + '\n\n_[Context truncated to fit token budget]_';
    }

    return md;
  }

  /**
   * Query semantic principles relevant to a campaign.
   * Pulls from Semantic nodes linked to experiments in this campaign.
   */
  private async getSemanticPrinciples(campaignId: string): Promise<SemanticPrinciple[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (s:Semantic)
         WHERE ANY(t IN s.tags WHERE t = $campaignTag OR t = 'research')
         OPTIONAL MATCH (e:Experiment {campaign_id: $campaignId})-[:VALIDATES|REFUTES|REINFORCES|CORRECTS|CONTRADICTS]->(s)
         WITH s, count(e) AS expCount
         RETURN s.id AS id, s.content AS claim, s.confidence AS confidence,
                COALESCE(head([t IN s.tags WHERE t <> $campaignTag AND t <> 'research']), 'general') AS domain,
                expCount
         ORDER BY s.confidence DESC
         LIMIT 20`,
        { campaignId, campaignTag: `campaign:${campaignId}` },
      );
      return result.records.map((r) => ({
        id: r.get('id') as string,
        claim: r.get('claim') as string,
        confidence: r.get('confidence') as number,
        domain: r.get('domain') as string,
        experiment_count: toNum(r.get('expCount')),
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
