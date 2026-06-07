/**
 * GraphReportService — Capability 3, community-free MVP.
 *
 * Generates a deterministic markdown audit of the MemBerry graph from a single
 * read-only snapshot. It does NOT call community detection and is
 * side-effect-free (no persisted runs) — re-scoped per Critical Issues #1/#19.
 *
 * Sections: summary, node/relation counts, memory-confidence summary, weighted-
 * degree Core Abstractions, import/dependency cycles, low-confidence knowledge,
 * knowledge gaps, recommended actions. "Surprising Connections" and community
 * sections are deferred (they depend on community detection).
 */
import { rankCoreNodes, type CoreNode } from './centrality.js';
import { detectCommunities, type CommunityResult } from './community.js';
import { findImportCycles } from './import-cycles.js';
import { renderGraphReport } from './report-renderer.js';
import type { GraphSnapshotService } from './snapshot.js';
import type {
  AmpGraphSnapshot,
  GraphReportInput,
  GraphReportResult,
  GraphReportStats,
} from './types.js';

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const NONFINAL_FACT_STATUSES = ['tentative', 'disputed', 'invalidated'];

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface LowConfidenceSemantic {
  id: string;
  label: string;
  confidence: number;
}

export interface NonFinalFact {
  id: string;
  label: string;
  status: string;
}

export interface LowConfidenceKnowledge {
  semantics: LowConfidenceSemantic[];
  facts: NonFinalFact[];
}

export interface KnowledgeGaps {
  orphan_entities: Array<{ id: string; label: string }>;
  empty_components: Array<{ id: string; label: string }>;
  uncited_sources: Array<{ id: string; label: string }>;
}

export interface ConfidenceSummary {
  high_confidence_semantics: number;
  low_confidence_semantics: number;
  tentative_facts: number;
  disputed_facts: number;
  invalidated_facts: number;
  contradiction_edges: number;
  correction_edges: number;
}

export interface GraphReportSections {
  graph: AmpGraphSnapshot;
  stats: GraphReportStats;
  node_type_counts: Array<{ type: string; count: number }>;
  relation_counts: Array<{ relation: string; count: number }>;
  confidence: ConfidenceSummary;
  core_nodes: CoreNode[];
  communities: CommunityResult;
  cycles: string[][];
  low_confidence: LowConfidenceKnowledge;
  gaps: KnowledgeGaps;
  /** True when the graph contains code (symbol/component) nodes; gates code-only sections. */
  has_code: boolean;
  max_items: number;
}

function countByType(graph: AmpGraphSnapshot, type: string): number {
  return graph.nodes.reduce((acc, n) => acc + (n.type === type ? 1 : 0), 0);
}

function computeStats(graph: AmpGraphSnapshot): GraphReportStats {
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    semantic_count: countByType(graph, 'semantic'),
    symbol_count: countByType(graph, 'symbol'),
    fact_count: countByType(graph, 'fact'),
    source_count: countByType(graph, 'source'),
    entity_count: countByType(graph, 'entity') + countByType(graph, 'component'),
  };
}

function nodeTypeCounts(graph: AmpGraphSnapshot): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const n of graph.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => cmp(a.type, b.type));
}

function relationCounts(graph: AmpGraphSnapshot): Array<{ relation: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of graph.edges) counts.set(e.relation, (counts.get(e.relation) ?? 0) + 1);
  return [...counts.entries()]
    .map(([relation, count]) => ({ relation, count }))
    .sort((a, b) => b.count - a.count || cmp(a.relation, b.relation));
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function confidenceSummary(graph: AmpGraphSnapshot): ConfidenceSummary {
  let high = 0;
  let low = 0;
  let tentative = 0;
  let disputed = 0;
  let invalidated = 0;
  for (const n of graph.nodes) {
    if (n.type === 'semantic') {
      const c = asNumber(n.properties.confidence);
      if (c === undefined) continue;
      if (c >= HIGH_CONFIDENCE_THRESHOLD) high += 1;
      else if (c < LOW_CONFIDENCE_THRESHOLD) low += 1;
    } else if (n.type === 'fact') {
      const status = String(n.properties.status ?? '');
      if (status === 'tentative') tentative += 1;
      else if (status === 'disputed') disputed += 1;
      else if (status === 'invalidated') invalidated += 1;
    }
  }
  let contradiction = 0;
  let correction = 0;
  for (const e of graph.edges) {
    if (e.relation === 'CONTRADICTS') contradiction += 1;
    else if (e.relation === 'CORRECTS') correction += 1;
  }
  return {
    high_confidence_semantics: high,
    low_confidence_semantics: low,
    tentative_facts: tentative,
    disputed_facts: disputed,
    invalidated_facts: invalidated,
    contradiction_edges: contradiction,
    correction_edges: correction,
  };
}

function lowConfidenceKnowledge(graph: AmpGraphSnapshot, limit: number): LowConfidenceKnowledge {
  const semantics: LowConfidenceSemantic[] = [];
  const facts: NonFinalFact[] = [];
  for (const n of graph.nodes) {
    if (n.type === 'semantic') {
      const c = asNumber(n.properties.confidence);
      if (c !== undefined && c < LOW_CONFIDENCE_THRESHOLD) {
        semantics.push({ id: n.id, label: n.label, confidence: c });
      }
    } else if (n.type === 'fact') {
      const status = String(n.properties.status ?? '');
      if (NONFINAL_FACT_STATUSES.includes(status)) {
        facts.push({ id: n.id, label: n.label, status });
      }
    }
  }
  semantics.sort((a, b) => a.confidence - b.confidence || cmp(a.id, b.id));
  facts.sort((a, b) => cmp(a.status, b.status) || cmp(a.id, b.id));
  return { semantics: semantics.slice(0, limit), facts: facts.slice(0, limit) };
}

function knowledgeGaps(graph: AmpGraphSnapshot, limit: number): KnowledgeGaps {
  const claimedEntities = new Set<string>();
  const componentsWithSymbols = new Set<string>();
  const citedSources = new Set<string>();
  for (const e of graph.edges) {
    if (e.relation === 'ABOUT') claimedEntities.add(e.target);
    else if (e.relation === 'DEFINED_IN') componentsWithSymbols.add(e.target);
    else if (e.relation === 'CITES') citedSources.add(e.target);
  }

  const pick = (predicate: (id: string, type: string) => boolean) =>
    graph.nodes
      .filter((n) => predicate(n.id, n.type))
      .map((n) => ({ id: n.id, label: n.label }))
      .sort((a, b) => cmp(a.id, b.id))
      .slice(0, limit);

  return {
    orphan_entities: pick((id, type) => type === 'entity' && !claimedEntities.has(id)),
    empty_components: pick((id, type) => type === 'component' && !componentsWithSymbols.has(id)),
    uncited_sources: pick((id, type) => type === 'source' && !citedSources.has(id)),
  };
}

export class GraphReportService {
  constructor(private snapshotService: GraphSnapshotService) {}

  async generate(input: GraphReportInput = {}): Promise<GraphReportResult> {
    const maxItems = input.max_items && input.max_items > 0 ? Math.floor(input.max_items) : 10;

    const graph = await this.snapshotService.snapshot({
      project_tag: input.project_tag,
      project_name: input.project_name,
      include_symbols: input.include_symbols,
      include_semantics: input.include_semantics,
      include_facts: input.include_facts,
      include_episodes: input.include_episodes,
      include_sources: input.include_sources,
    });

    const sections: GraphReportSections = {
      graph,
      stats: computeStats(graph),
      node_type_counts: nodeTypeCounts(graph),
      relation_counts: relationCounts(graph),
      confidence: confidenceSummary(graph),
      core_nodes: rankCoreNodes(graph, maxItems),
      communities: detectCommunities(graph, { sampleSize: 3 }),
      cycles: findImportCycles(graph, { maxCycles: maxItems }),
      low_confidence: lowConfidenceKnowledge(graph, maxItems),
      gaps: knowledgeGaps(graph, maxItems),
      has_code: graph.nodes.some((nd) => nd.type === 'symbol' || nd.type === 'component'),
      max_items: maxItems,
    };

    return { markdown: renderGraphReport(sections), stats: sections.stats };
  }
}
