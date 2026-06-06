/**
 * JSON export of a graph snapshot. The snapshot is already secret-safe
 * (allowlisted + redacted at the boundary), so this is a straight, deterministic
 * serialization — node/edge order is fixed by the snapshot's final sort.
 */
import type { AmpGraphEdge, AmpGraphNode, AmpGraphSnapshot } from './types.js';

export interface GraphJsonDocument {
  format: 'amp-graph';
  version: 1;
  generated_at: string;
  project_tag?: string;
  project_name?: string;
  truncated: boolean;
  total_available: number;
  nodes: AmpGraphNode[];
  edges: AmpGraphEdge[];
}

export function buildJsonDocument(graph: AmpGraphSnapshot): GraphJsonDocument {
  const doc: GraphJsonDocument = {
    format: 'amp-graph',
    version: 1,
    generated_at: graph.generated_at,
    truncated: graph.truncated,
    total_available: graph.total_available,
    nodes: graph.nodes,
    edges: graph.edges,
  };
  if (graph.project_tag) doc.project_tag = graph.project_tag;
  if (graph.project_name) doc.project_name = graph.project_name;
  return doc;
}

export function exportJson(graph: AmpGraphSnapshot): string {
  return JSON.stringify(buildJsonDocument(graph), null, 2);
}
