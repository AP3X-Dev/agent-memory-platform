/**
 * Deterministic markdown renderer for the graph report. Pure function of its
 * input (no timestamps generated here — `generated_at` comes from the snapshot),
 * so the output is stable enough for snapshot testing and handles empty graphs.
 */
import type { GraphReportSections } from './report.js';

function fmt(n: number): string {
  return String(n);
}

export function renderGraphReport(s: GraphReportSections): string {
  const { graph, stats } = s;
  const lines: string[] = [];

  // 1. Header
  lines.push('# AMP Graph Report');
  lines.push('');
  lines.push(`- **Project:** ${graph.project_name ?? '(all projects)'}`);
  lines.push(`- **Project tag:** ${graph.project_tag ?? '(none)'}`);
  lines.push(`- **Generated:** ${graph.generated_at}`);
  if (graph.source_commit) lines.push(`- **Source commit:** ${graph.source_commit}`);
  if (graph.truncated) {
    lines.push(
      `- **Note:** snapshot was truncated at the node limit (${fmt(stats.nodes)} nodes captured); counts are a lower bound.`,
    );
  }
  lines.push('');

  // 2. Corpus / Graph Summary
  lines.push('## Graph Summary');
  lines.push('');
  lines.push(`- Total nodes: ${fmt(stats.nodes)}`);
  lines.push(`- Total edges: ${fmt(stats.edges)}`);
  lines.push('');
  lines.push('### Nodes by type');
  lines.push('');
  if (s.node_type_counts.length === 0) {
    lines.push('_No nodes in scope._');
  } else {
    lines.push('| Type | Count |');
    lines.push('| --- | --- |');
    for (const row of s.node_type_counts) lines.push(`| ${row.type} | ${fmt(row.count)} |`);
  }
  lines.push('');
  lines.push('### Relations by type');
  lines.push('');
  if (s.relation_counts.length === 0) {
    lines.push('_No relations in scope._');
  } else {
    lines.push('| Relation | Count |');
    lines.push('| --- | --- |');
    for (const row of s.relation_counts) lines.push(`| ${row.relation} | ${fmt(row.count)} |`);
  }
  lines.push('');

  // 3. Memory Confidence Summary
  const c = s.confidence;
  lines.push('## Memory Confidence Summary');
  lines.push('');
  lines.push(`- High-confidence semantics (≥ 0.7): ${fmt(c.high_confidence_semantics)}`);
  lines.push(`- Low-confidence semantics (< 0.5): ${fmt(c.low_confidence_semantics)}`);
  lines.push(`- Tentative facts: ${fmt(c.tentative_facts)}`);
  lines.push(`- Disputed facts: ${fmt(c.disputed_facts)}`);
  lines.push(`- Invalidated facts: ${fmt(c.invalidated_facts)}`);
  lines.push(`- Contradiction signals: ${fmt(c.contradiction_edges)}`);
  lines.push(`- Correction signals: ${fmt(c.correction_edges)}`);
  lines.push('');

  // 5. Core Abstractions (weighted degree)
  lines.push('## Core Abstractions');
  lines.push('');
  lines.push('_High-centrality nodes ranked by weighted degree over the snapshot graph._');
  lines.push('');
  if (s.core_nodes.length === 0) {
    lines.push('_No connected nodes in scope._');
  } else {
    lines.push('| Node | Type | Weighted degree | Degree |');
    lines.push('| --- | --- | --- | --- |');
    for (const n of s.core_nodes) {
      lines.push(`| ${n.label} | ${n.type} | ${fmt(n.weighted_degree)} | ${fmt(n.degree)} |`);
    }
  }
  lines.push('');

  // 6b. Knowledge Areas (themes) — structural clusters, in-memory overlay only.
  lines.push('## Knowledge Areas');
  lines.push('');
  lines.push('_Structural clusters of related knowledge (analytics overlay; not stored)._');
  lines.push('');
  const areas = s.communities.communities.filter((c) => c.size >= 2).slice(0, s.max_items);
  if (areas.length < 2) {
    lines.push('No distinct knowledge areas detected (graph is sparse or uniformly connected).');
  } else {
    for (const a of areas) {
      const sample = a.sample.length > 0 ? ` — e.g. ${a.sample.join(', ')}` : '';
      lines.push(`- **${a.label}** (${fmt(a.size)} nodes, cohesion ${a.cohesion.toFixed(2)})${sample}`);
    }
  }
  lines.push('');

  // 8. Dependency Cycles (general — works for code imports and any USES graph,
  //    e.g. circular org-chart or process dependencies).
  lines.push('## Dependency Cycles');
  lines.push('');
  if (s.cycles.length === 0) {
    lines.push('No dependency cycles detected.');
  } else {
    for (const cycle of s.cycles) {
      lines.push(`- ${[...cycle, cycle[0]].join(' → ')}`);
    }
  }
  lines.push('');

  // 9. Ambiguous / Low-Confidence Knowledge
  lines.push('## Low-Confidence Knowledge');
  lines.push('');
  if (s.low_confidence.semantics.length === 0 && s.low_confidence.facts.length === 0) {
    lines.push('No low-confidence semantics or non-final facts in scope.');
  } else {
    if (s.low_confidence.semantics.length > 0) {
      lines.push('**Low-confidence semantics:**');
      for (const sem of s.low_confidence.semantics) {
        lines.push(`- (${sem.confidence.toFixed(2)}) ${sem.label}`);
      }
      lines.push('');
    }
    if (s.low_confidence.facts.length > 0) {
      lines.push('**Non-final facts:**');
      for (const f of s.low_confidence.facts) {
        lines.push(`- [${f.status}] ${f.label}`);
      }
      lines.push('');
    }
  }

  // 10. Knowledge Gaps
  lines.push('## Knowledge Gaps');
  lines.push('');
  const g = s.gaps;
  // Code-only gaps (empty components) are surfaced only when the graph has code,
  // so non-coding memory graphs aren't cluttered with empty coding sections.
  const showEmptyComponents = s.has_code && g.empty_components.length > 0;
  const noGaps =
    g.orphan_entities.length === 0 && !showEmptyComponents && g.uncited_sources.length === 0;
  if (noGaps) {
    lines.push('No knowledge gaps detected.');
  } else {
    if (g.orphan_entities.length > 0) {
      lines.push('**Entities with no semantic claims:**');
      for (const e of g.orphan_entities) lines.push(`- ${e.label}`);
      lines.push('');
    }
    if (showEmptyComponents) {
      lines.push('**Components with no symbols:**');
      for (const e of g.empty_components) lines.push(`- ${e.label}`);
      lines.push('');
    }
    if (g.uncited_sources.length > 0) {
      lines.push('**Sources with no claims:**');
      for (const e of g.uncited_sources) lines.push(`- ${e.label}`);
      lines.push('');
    }
  }

  // 12. Recommended Actions
  lines.push('## Recommended Actions');
  lines.push('');
  lines.push('- Run `amp_lint` for orphan/broken-link/contradiction checks.');
  if (c.low_confidence_semantics > 0 || c.contradiction_edges > 0) {
    lines.push('- Review and resolve low-confidence claims and contradictions.');
  }
  if (g.orphan_entities.length > 0) {
    lines.push('- Add semantic claims for entities with no knowledge attached.');
  }
  if (s.cycles.length > 0) {
    lines.push('- Break the reported import/dependency cycles.');
  }
  lines.push('');

  return lines.join('\n');
}
