// packages/research/src/tools.ts
// MCP tool definitions for the research domain.
// These are registered alongside the core AMP tools.

import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ExperimentNode, CampaignNode } from './types.js';

// ─── Service interfaces (injected) ───────────────────────────────────────────

export interface IExperimentStore {
  create(node: ExperimentNode): Promise<string>;
  linkToParent(experimentId: string, parentId: string): Promise<void>;
  linkToComponent(experimentId: string, componentPath: string, domain: string, outcome: string): Promise<void>;
  linkToCampaign(experimentId: string, campaignId: string): Promise<void>;
  getStats(campaignId: string): Promise<{ total: number; keeps: number; discards: number; crashes: number; thoughts: number; interesting: number }>;
}

export interface ICampaignStore {
  create(node: CampaignNode): Promise<string>;
  getById(campaignId: string): Promise<CampaignNode | null>;
  updateStats(campaignId: string, updates: Record<string, unknown>): Promise<void>;
  incrementConsolidation(campaignId: string): Promise<void>;
}

export interface IResearchContextBuilder {
  renderMarkdown(campaignId: string, maxTokens?: number): Promise<string>;
}

export interface IHypothesisNavigator {
  getTree(campaignId: string): Promise<unknown[]>;
  findByComponent(campaignId: string, componentPath: string, status?: string): Promise<unknown[]>;
  renderTreeMarkdown(roots: unknown[]): string;
}

export interface IContradictionDetector {
  detect(campaignId: string): Promise<Array<{
    principle_a: { id: string; claim: string; confidence: number };
    principle_b: { id: string; claim: string; confidence: number };
    reason: string;
  }>>;
  findUncertain(campaignId: string, maxConfidence?: number): Promise<Array<{
    id: string; claim: string; confidence: number; domain: string;
  }>>;
}

export interface IResearchConsolidation {
  run(campaignId: string): Promise<{
    patterns_detected: number;
    semantic_created: string[];
    semantic_updated: string[];
    confidence_changes: Array<{ id: string; from: number; to: number }>;
    procedural_updates: string[];
  }>;
}

// ─── Injected instances ──────────────────────────────────────────────────────

let experimentStore: IExperimentStore | null = null;
let campaignStore: ICampaignStore | null = null;
let contextBuilder: IResearchContextBuilder | null = null;
let hypothesisNav: IHypothesisNavigator | null = null;
let contradictionDetector: IContradictionDetector | null = null;
let researchConsolidation: IResearchConsolidation | null = null;

export function setResearchServiceInstances(services: {
  experimentStore: IExperimentStore;
  campaignStore: ICampaignStore;
  contextBuilder: IResearchContextBuilder;
  hypothesisNavigator: IHypothesisNavigator;
  contradictionDetector: IContradictionDetector;
  researchConsolidation: IResearchConsolidation;
}): void {
  experimentStore = services.experimentStore;
  campaignStore = services.campaignStore;
  contextBuilder = services.contextBuilder;
  hypothesisNav = services.hypothesisNavigator;
  contradictionDetector = services.contradictionDetector;
  researchConsolidation = services.researchConsolidation;
}

// ─── Tool names ──────────────────────────────────────────────────────────────

export const RESEARCH_TOOL_NAMES = [
  'amp_research_init',
  'amp_research_log',
  'amp_research_context',
  'amp_research_tree',
  'amp_research_contradictions',
  'amp_research_consolidate',
] as const;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ResearchInitSchema = {
  campaign_name: z.string().describe('Human-readable campaign name (e.g. "reduce-p99-latency")'),
  objective: z.string().describe('What we are optimizing or improving'),
  metric_name: z.string().describe('Primary metric name (e.g. "val_bpb", "p99_ms", "test_pass_rate")'),
  metric_direction: z.enum(['lower', 'higher']).describe('Whether lower or higher metric values are better'),
  run_command: z.string().describe('Shell command to run one experiment'),
  measure_command: z.string().describe('Shell command to measure the metric after a run'),
  scope_files: z.array(z.string()).optional().describe('Files/dirs in scope for modification'),
  constraints: z.string().optional().describe('Constraints and off-limits rules'),
};

const ResearchLogSchema = {
  campaign_id: z.string().describe('Campaign ID from amp_research_init'),
  session_id: z.string().describe('Session identifier for this agent session'),
  experiment_number: z.number().int().nonnegative().describe('Sequential experiment number (0 = baseline)'),
  branch: z.string().describe('Git branch name'),
  parent_id: z.string().nullable().optional().describe('Parent experiment ID (null for baseline)'),
  commit: z.string().nullable().optional().describe('Git commit hash'),
  metric_value: z.number().describe('Primary metric value'),
  secondary_metrics: z.record(z.number()).optional().describe('Secondary metric values'),
  status: z.enum(['keep', 'discard', 'crash', 'thought', 'keep*', 'interesting', 'timeout'])
    .describe('Experiment outcome status'),
  duration_s: z.number().nonnegative().describe('Experiment duration in seconds'),
  hypothesis: z.string().describe('What you predicted would happen'),
  description: z.string().describe('What was actually changed'),
  insight: z.string().describe('What was learned from this experiment'),
  components_touched: z.array(z.string()).optional().describe('File paths that were modified'),
  component_domain: z.string().optional().describe('Domain category for the components (e.g. "architecture", "optimizer", "config")'),
};

const ResearchContextSchema = {
  campaign_id: z.string().describe('Campaign ID'),
  max_tokens: z.number().int().positive().optional().default(4000)
    .describe('Max tokens for the assembled context'),
};

const ResearchTreeSchema = {
  campaign_id: z.string().describe('Campaign ID'),
  component: z.string().optional().describe('Filter to experiments that touched this component path'),
  status: z.enum(['keep', 'discard', 'crash', 'thought', 'keep*', 'interesting', 'timeout'])
    .optional().describe('Filter to experiments with this status'),
};

const ResearchContradictionsSchema = {
  campaign_id: z.string().describe('Campaign ID'),
  include_uncertain: z.boolean().optional().default(false)
    .describe('Also return low-confidence principles that need experiments to resolve'),
};

const ResearchConsolidateSchema = {
  campaign_id: z.string().describe('Campaign ID'),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerResearchTools(server: McpServer): void {
  // ─── amp_research_init ──────────────────────────────────────────────────
  server.tool(
    'amp_research_init',
    'Initialize a new research campaign. Creates campaign entity and returns campaign_id. Call once at the start of a new research session.',
    ResearchInitSchema,
    async (args) => {
      if (!campaignStore) throw new Error('Research services not initialised');

      const now = new Date();
      const slug = args.campaign_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const campaignId = `${now.toISOString().slice(0, 10).replace(/-/g, '')}-${slug}`;
      const id = nanoid();

      const node: CampaignNode = {
        id,
        campaign_id: campaignId,
        name: args.campaign_name,
        objective: args.objective,
        metric_name: args.metric_name,
        metric_direction: args.metric_direction,
        run_command: args.run_command,
        measure_command: args.measure_command,
        scope_files: args.scope_files ?? [],
        constraints: args.constraints ?? '',
        baseline_metric: null,
        best_metric: null,
        best_commit: null,
        best_experiment_id: null,
        total_experiments: 0,
        total_keeps: 0,
        total_discards: 0,
        consolidation_count: 0,
        last_consolidation_at: null,
        status: 'active',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      await campaignStore.create(node);
      return textContent(JSON.stringify({ campaign_id: campaignId, id }, null, 2));
    },
  );

  // ─── amp_research_log ───────────────────────────────────────────────────
  server.tool(
    'amp_research_log',
    'Log an experiment result. Creates an Experiment node in the graph with full provenance: parent link, component edges, campaign membership. Returns experiment ID and whether consolidation should run.',
    ResearchLogSchema,
    async (args) => {
      if (!experimentStore || !campaignStore) throw new Error('Research services not initialised');

      const id = `exp-${nanoid(10)}`;
      const now = new Date().toISOString();

      // Get metric name from campaign BEFORE constructing the node
      // so it is persisted with the correct value on create
      const campaign = await campaignStore.getById(args.campaign_id);

      const node: ExperimentNode = {
        id,
        session_id: args.session_id,
        agent_id: 'amp-researcher',
        campaign_id: args.campaign_id,
        experiment_number: args.experiment_number,
        branch: args.branch,
        parent_id: args.parent_id ?? null,
        commit_hash: args.commit ?? null,
        metric_name: campaign?.metric_name ?? '',
        metric_value: args.metric_value,
        secondary_metrics: args.secondary_metrics ?? {},
        status: args.status,
        duration_s: args.duration_s,
        hypothesis: args.hypothesis,
        description: args.description,
        insight: args.insight,
        components_touched: args.components_touched ?? [],
        created_at: now,
      };

      // Create experiment node
      await experimentStore.create(node);

      // Link to parent if exists
      if (args.parent_id) {
        await experimentStore.linkToParent(id, args.parent_id);
      }

      // Link to campaign
      await experimentStore.linkToCampaign(id, args.campaign_id);

      // Link to components
      const domain = args.component_domain ?? 'unknown';
      for (const comp of args.components_touched ?? []) {
        await experimentStore.linkToComponent(id, comp, domain, args.status);
      }

      // Update campaign stats
      const stats = await experimentStore.getStats(args.campaign_id);
      const isKeep = args.status === 'keep' || args.status === 'keep*';
      const updatePayload: Record<string, unknown> = {
        total_experiments: stats.total,
        total_keeps: stats.keeps,
        total_discards: stats.discards,
      };

      // Update best metric if this is a keep and it's better
      if (isKeep && campaign) {
        const isBetter = campaign.best_metric === null
          || (campaign.metric_direction === 'lower' && args.metric_value < campaign.best_metric)
          || (campaign.metric_direction === 'higher' && args.metric_value > campaign.best_metric);
        if (isBetter) {
          updatePayload.best_metric = args.metric_value;
          updatePayload.best_commit = args.commit;
          updatePayload.best_experiment_id = id;
        }
      }

      // Set baseline if experiment #0
      if (args.experiment_number === 0 && campaign) {
        updatePayload.baseline_metric = args.metric_value;
      }

      await campaignStore.updateStats(args.campaign_id, updatePayload);

      // Check if consolidation should run (every 10 real experiments)
      const realCount = stats.total - stats.thoughts;
      const shouldConsolidate = realCount > 0 && realCount % 10 === 0;

      return textContent(JSON.stringify({
        experiment_id: id,
        should_consolidate: shouldConsolidate,
        stats: {
          total: stats.total,
          keeps: stats.keeps,
          discards: stats.discards,
        },
      }, null, 2));
    },
  );

  // ─── amp_research_context ────────────────────────────────────────────────
  server.tool(
    'amp_research_context',
    'Build dynamic research context for the THINK phase. Returns assembled markdown with: campaign state, semantic principles, recent wins, dead ends, contradictions, and experiment stats.',
    ResearchContextSchema,
    async (args) => {
      if (!contextBuilder) throw new Error('Research services not initialised');
      const md = await contextBuilder.renderMarkdown(args.campaign_id, args.max_tokens);
      return textContent(md);
    },
  );

  // ─── amp_research_tree ──────────────────────────────────────────────────
  server.tool(
    'amp_research_tree',
    'Query the hypothesis tree for a campaign. Returns an indented markdown visualization of the experiment lineage. Optionally filter by component or status.',
    ResearchTreeSchema,
    async (args) => {
      if (!hypothesisNav) throw new Error('Research services not initialised');

      if (args.component) {
        const results = await hypothesisNav.findByComponent(
          args.campaign_id,
          args.component,
          args.status,
        );
        return textContent(JSON.stringify(results, null, 2));
      }

      const tree = await hypothesisNav.getTree(args.campaign_id);
      const md = hypothesisNav.renderTreeMarkdown(tree);
      return textContent(md);
    },
  );

  // ─── amp_research_contradictions ────────────────────────────────────────
  server.tool(
    'amp_research_contradictions',
    'Find conflicting semantic principles in a campaign. Also optionally returns low-confidence principles that need experiments to resolve uncertainty.',
    ResearchContradictionsSchema,
    async (args) => {
      if (!contradictionDetector) throw new Error('Research services not initialised');

      const contradictions = await contradictionDetector.detect(args.campaign_id);
      const result: Record<string, unknown> = { contradictions };

      if (args.include_uncertain) {
        const uncertain = await contradictionDetector.findUncertain(args.campaign_id);
        result.uncertain_principles = uncertain;
      }

      return textContent(JSON.stringify(result, null, 2));
    },
  );

  // ─── amp_research_consolidate ───────────────────────────────────────────
  server.tool(
    'amp_research_consolidate',
    'Run research-specific consolidation. Detects patterns in experiment history (component leverage, exhausted directions, crash patterns, combo synergies) and creates/updates semantic nodes. Call every 10 experiments or on session wrap-up.',
    ResearchConsolidateSchema,
    async (args) => {
      if (!researchConsolidation || !campaignStore) throw new Error('Research services not initialised');

      const result = await researchConsolidation.run(args.campaign_id);
      await campaignStore.incrementConsolidation(args.campaign_id);

      return textContent(JSON.stringify(result, null, 2));
    },
  );
}
