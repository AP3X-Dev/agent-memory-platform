/**
 * GraphSnapshotService — a deterministic, project-scoped, bounded, secret-safe
 * in-memory view of the AMP Neo4j graph. It is the single choke point every
 * later capability (report, export, community detection, PR impact) consumes.
 *
 * Invariants (from the hardened design):
 *  - Deterministic: every node query has an explicit total `ORDER BY` on a
 *    stable key + per-query `LIMIT`, AND a final TypeScript sort (nodes by id;
 *    edges by source/target/relation/id) after merging the separate queries.
 *  - Bounded: `max_nodes` (default 50000) is enforced via `LIMIT neo4j.int(...)`
 *    on every query; `include_episodes` defaults to false. Returns `truncated`
 *    and `total_available`.
 *  - Secret-safe: properties pass through the per-node-type allowlist + secret
 *    redaction at this boundary (see allowlist.ts).
 *  - Project scoping: ONE reconciled strategy — project-root match by EXACT name
 *    (toLower equality, never CONTAINS substring), delimiter-bounded repo path
 *    match for Symbols/Components, tags for Semantics, project_tag for
 *    Sources/Facts/Episodics.
 *  - Read-only: never mutates the graph.
 */
import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { applyAllowlist, redactSecrets, sanitizeEdgeProps } from './allowlist.js';
import type {
  AmpGraphEdge,
  AmpGraphNode,
  AmpGraphNodeType,
  AmpGraphSnapshot,
  SnapshotInput,
} from './types.js';

export const DEFAULT_MAX_NODES = 50000;

/** Minimal shape of a neo4j-driver Node as returned by `record.get(...)`. */
interface Neo4jNodeLike {
  labels?: string[];
  properties?: Record<string, unknown>;
  elementId?: string;
}

/**
 * Edge weights bias structural/code/architecture relations above memory
 * provenance so semantic edges do not dominate weighted-degree centrality
 * (Risk: "Semantic Edges Dominate Structural Communities").
 */
const RELATION_WEIGHTS: Record<string, number> = {
  CONTAINS: 3,
  USES: 3,
  CALLS: 3,
  EXTENDS: 3,
  IMPLEMENTS: 3,
  EMITS: 3,
  LISTENS: 3,
  SYMBOL_CALLS: 3,
  SYMBOL_IMPORTS: 3,
  SYMBOL_INHERITS: 3,
  SYMBOL_IMPLEMENTS: 3,
  SYMBOL_CONTAINS: 3,
  DEFINED_IN: 2,
  APPLIES_TO: 2,
  ABOUT: 1,
  CITES: 1,
  REINFORCES: 1,
  CORRECTS: 1,
  CONTRADICTS: 1,
  SUPERSEDES: 1,
  PROMOTED_FROM: 1,
  FACT_ABOUT: 1,
  SOURCED_FROM: 1,
  SUPERSEDES_FACT: 1,
};

function relationWeight(rel: string): number {
  return RELATION_WEIGHTS[rel] ?? 1;
}

// ─── Node scoping queries ───────────────────────────────────────────────────
// Each has a total ORDER BY on a stable key and a per-query LIMIT (neo4j.int).

const ENTITY_QUERY = `
MATCH (e:Entity)
WHERE $projectName IS NULL
   OR EXISTS {
     MATCH (project:Entity {type: 'project'})-[:CONTAINS*0..]->(e)
     WHERE toLower(project.name) = toLower($projectName)
   }
WITH e ORDER BY e.id LIMIT $limit
RETURN e`;

const SYMBOL_QUERY = `
MATCH (s:Symbol)-[:DEFINED_IN]->(c:Entity:Component)
WHERE $projectName IS NULL
   OR c.path CONTAINS ('/' + $projectName + '/')
   OR c.path ENDS WITH ('/' + $projectName)
WITH s, c ORDER BY s.id LIMIT $limit
RETURN s, c`;

const SEMANTIC_QUERY = `
MATCH (s:Semantic)
WHERE $projectTag IS NULL OR $projectTag IN s.tags
WITH s ORDER BY s.id LIMIT $limit
RETURN s`;

const FACT_QUERY = `
MATCH (f:Fact)
WHERE $projectTag IS NULL OR f.scope = $projectTag
WITH f ORDER BY f.id LIMIT $limit
RETURN f`;

const SOURCE_QUERY = `
MATCH (s:Source)
WHERE $projectTag IS NULL OR s.project_tag = $projectTag
WITH s ORDER BY s.id LIMIT $limit
RETURN s`;

const ASPECT_QUERY = `
MATCH (a:Aspect)
WHERE $projectName IS NULL
   OR EXISTS {
     MATCH (a)-[:APPLIES_TO]->(e:Entity)
     MATCH (project:Entity {type: 'project'})-[:CONTAINS*0..]->(e)
     WHERE toLower(project.name) = toLower($projectName)
   }
WITH a ORDER BY a.id LIMIT $limit
RETURN a`;

const EPISODIC_QUERY = `
MATCH (e:Episodic)
WHERE $projectTag IS NULL OR e.scope = $projectTag
WITH e ORDER BY e.id LIMIT $limit
RETURN e`;

// Edges among collected nodes only. Deterministic ORDER BY; bounded LIMIT.
const EDGE_QUERY = `
MATCH (a)-[r]->(b)
WHERE a.id IN $ids AND b.id IN $ids
RETURN a.id AS source, b.id AS target, type(r) AS relation,
       elementId(r) AS eid, properties(r) AS props
ORDER BY source, target, relation, eid
LIMIT $maxEdges`;

// ─── Node mapping ───────────────────────────────────────────────────────────

function nodeType(labels: string[]): AmpGraphNodeType {
  if (labels.includes('Community')) return 'community';
  if (labels.includes('Symbol')) return 'symbol';
  if (labels.includes('Component')) return 'component';
  if (labels.includes('Semantic')) return 'semantic';
  if (labels.includes('Episodic')) return 'episodic';
  if (labels.includes('Fact')) return 'fact';
  if (labels.includes('Source')) return 'source';
  if (labels.includes('Aspect')) return 'aspect';
  if (labels.includes('Entity')) return 'entity';
  return 'unknown';
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Human-readable label, derived from SAFE fields only (never signature/content raw). */
function displayLabel(type: AmpGraphNodeType, props: Record<string, unknown>): string {
  switch (type) {
    case 'source':
      return String(props.title ?? props.id ?? '');
    case 'fact':
      return [props.subject, props.predicate, props.object].filter(Boolean).join(' ');
    case 'semantic':
      return truncate(String(props.content ?? props.id ?? ''), 100);
    case 'episodic':
      return truncate(String(props.task ?? props.id ?? ''), 100);
    case 'community':
      return String(props.label ?? props.id ?? '');
    default:
      return String(props.name ?? props.title ?? props.id ?? '');
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Stable id: prefer a real `id` property; otherwise synthesize from labels+key. */
function resolveId(type: AmpGraphNodeType, props: Record<string, unknown>): string {
  if (typeof props.id === 'string' && props.id.length > 0) return props.id;
  switch (type) {
    case 'symbol':
      return `Symbol:file:${props.file_path ?? ''}:${props.kind ?? ''}:${props.name ?? ''}:${props.start_line ?? ''}`;
    case 'source':
      return `Source:path:${props.path ?? ''}`;
    case 'entity':
    case 'component':
    case 'aspect':
      return `${capitalize(type)}:name:${props.name ?? ''}`;
    default:
      return `${type}:${String(props.name ?? props.title ?? props.subject ?? '')}`;
  }
}

/** source_file for code nodes (needed by PR impact); redacted, never raw Source.path. */
function resolveSourceFile(
  type: AmpGraphNodeType,
  props: Record<string, unknown>,
): string | undefined {
  const raw = type === 'symbol' ? props.file_path : type === 'component' ? props.path : undefined;
  return typeof raw === 'string' ? redactSecrets(raw) : undefined;
}

function mapNode(neo: Neo4jNodeLike): AmpGraphNode {
  const labels = neo.labels ?? [];
  const props = neo.properties ?? {};
  const type = nodeType(labels);
  const node: AmpGraphNode = {
    id: resolveId(type, props),
    label: redactSecrets(displayLabel(type, props)),
    type,
    properties: applyAllowlist(type, props),
  };
  const sf = resolveSourceFile(type, props);
  if (sf !== undefined) node.source_file = sf;
  if (typeof props.project_tag === 'string') node.project_tag = props.project_tag;
  return node;
}

// ─── Sorting helpers ────────────────────────────────────────────────────────

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function edgeCmp(a: AmpGraphEdge, b: AmpGraphEdge): number {
  return (
    cmp(a.source, b.source) ||
    cmp(a.target, b.target) ||
    cmp(a.relation, b.relation) ||
    cmp(a.id, b.id)
  );
}

function clampMaxNodes(v?: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return DEFAULT_MAX_NODES;
  return Math.floor(v);
}

// ─── Service ────────────────────────────────────────────────────────────────

export class GraphSnapshotService {
  constructor(private driver: Driver) {}

  async snapshot(input: SnapshotInput = {}): Promise<AmpGraphSnapshot> {
    const projectName = input.project_name?.trim() ? input.project_name.trim() : null;
    const projectTag = input.project_tag?.trim() ? input.project_tag.trim() : null;
    const maxNodes = clampMaxNodes(input.max_nodes);
    const limit = neo4j.int(maxNodes);

    const include = {
      symbols: input.include_symbols ?? true,
      semantics: input.include_semantics ?? true,
      episodes: input.include_episodes ?? false, // numerous + least structural
      facts: input.include_facts ?? true,
      sources: input.include_sources ?? true,
      aspects: input.include_aspects ?? true,
    };

    const session = this.driver.session();
    const nodeMap = new Map<string, AmpGraphNode>();
    let truncated = false;

    const ingest = (neoNodes: Array<Neo4jNodeLike | null>) => {
      const real = neoNodes.filter((n): n is Neo4jNodeLike => n != null);
      if (real.length >= maxNodes) truncated = true;
      for (const n of real) {
        const node = mapNode(n);
        if (!nodeMap.has(node.id)) nodeMap.set(node.id, node);
      }
    };

    try {
      // 1. Entities (project root by EXACT name + CONTAINS traversal).
      {
        const res = await session.run(ENTITY_QUERY, { projectName, limit });
        ingest(res.records.map((r) => r.get('e') as Neo4jNodeLike));
      }
      // 2. Symbols + their defining Components (delimiter-bounded path scope).
      if (include.symbols) {
        const res = await session.run(SYMBOL_QUERY, { projectName, limit });
        const nodes: Array<Neo4jNodeLike | null> = [];
        for (const r of res.records) {
          nodes.push(r.get('s') as Neo4jNodeLike);
          nodes.push(r.get('c') as Neo4jNodeLike | null);
        }
        ingest(nodes);
      }
      // 3. Semantics (by tag membership).
      if (include.semantics) {
        const res = await session.run(SEMANTIC_QUERY, { projectTag, limit });
        ingest(res.records.map((r) => r.get('s') as Neo4jNodeLike));
      }
      // 4. Facts (by scope).
      if (include.facts) {
        const res = await session.run(FACT_QUERY, { projectTag, limit });
        ingest(res.records.map((r) => r.get('f') as Neo4jNodeLike));
      }
      // 5. Sources (by project_tag).
      if (include.sources) {
        const res = await session.run(SOURCE_QUERY, { projectTag, limit });
        ingest(res.records.map((r) => r.get('s') as Neo4jNodeLike));
      }
      // 6. Aspects (applied to in-scope entities).
      if (include.aspects) {
        const res = await session.run(ASPECT_QUERY, { projectName, limit });
        ingest(res.records.map((r) => r.get('a') as Neo4jNodeLike));
      }
      // 7. Episodics (default OFF — most numerous, least structural).
      if (include.episodes) {
        const res = await session.run(EPISODIC_QUERY, { projectTag, limit });
        ingest(res.records.map((r) => r.get('e') as Neo4jNodeLike));
      }

      const edges = await this.queryEdges(session, [...nodeMap.keys()], maxNodes);

      // Final deterministic sort across separately-merged queries.
      const nodes = [...nodeMap.values()].sort((a, b) => cmp(a.id, b.id));
      edges.sort(edgeCmp);

      const snapshot: AmpGraphSnapshot = {
        generated_at: new Date().toISOString(),
        nodes,
        edges,
        truncated,
        total_available: nodes.length,
      };
      if (projectTag) snapshot.project_tag = projectTag;
      if (projectName) snapshot.project_name = projectName;
      return snapshot;
    } finally {
      await session.close();
    }
  }

  private async queryEdges(
    session: Session,
    ids: string[],
    maxNodes: number,
  ): Promise<AmpGraphEdge[]> {
    if (ids.length === 0) return [];
    const maxEdges = neo4j.int(maxNodes * 10);
    const res = await session.run(EDGE_QUERY, { ids, maxEdges });
    const seen = new Map<string, number>();
    const edges: AmpGraphEdge[] = [];
    for (const r of res.records) {
      const source = String(r.get('source'));
      const target = String(r.get('target'));
      const relation = String(r.get('relation'));
      const rawProps = (r.get('props') as Record<string, unknown> | null) ?? {};
      const base = `${source}|${relation}|${target}`;
      const dupCount = seen.get(base) ?? 0;
      seen.set(base, dupCount + 1);
      edges.push({
        id: dupCount === 0 ? base : `${base}#${dupCount}`,
        source,
        target,
        relation,
        weight: relationWeight(relation),
        properties: sanitizeEdgeProps(rawProps),
      });
    }
    return edges;
  }
}
