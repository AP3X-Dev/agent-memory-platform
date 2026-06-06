/**
 * PR impact & conflict analysis over the code graph.
 *
 * MVP scope (per Correction C-08): blast radius is computed at the
 * file/symbol level — changed files → their Symbols (DEFINED_IN) → reverse
 * SYMBOL_IMPORTS/SYMBOL_CALLS dependents → their files — plus the in-memory
 * "knowledge areas" (communities) the changed files belong to. No brittle
 * Symbol→module-Entity bridge is assumed. Conflict analysis flags PR pairs whose
 * impacted file sets overlap.
 */
import type { Driver } from 'neo4j-driver';
import { detectCommunities } from './community.js';
import { rankCoreNodes } from './centrality.js';
import type { GraphSnapshotService } from './snapshot.js';
import type { PullRequestProvider } from './providers/pull-request-provider.js';
import type {
  PrConflictPair,
  PrConflictsInput,
  PrConflictsResult,
  PrImpactInput,
  PrImpactResult,
} from './types.js';

function posix(p: string): string {
  return p.replace(/\\/g, '/');
}
function uniqueSorted(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/** A component path matches a (repo-relative) changed file by exact or boundary-suffix. */
function pathMatchesFile(componentPath: string, file: string): boolean {
  const c = posix(componentPath);
  return c === file || c.endsWith('/' + file);
}

interface Dependents {
  changedComponents: string[];
  symbols: string[];
  dependentFiles: string[];
}

const DEPENDENTS_QUERY = `
UNWIND $files AS f
MATCH (c:Entity:Component)
WHERE c.path = f OR c.path ENDS WITH ('/' + f)
OPTIONAL MATCH (s:Symbol)-[:DEFINED_IN]->(c)
OPTIONAL MATCH (dep:Symbol)-[:SYMBOL_IMPORTS|SYMBOL_CALLS]->(s)
OPTIONAL MATCH (dep)-[:DEFINED_IN]->(dc:Entity:Component)
RETURN collect(DISTINCT c.path) AS changedComponents,
       collect(DISTINCT s.name) AS symbols,
       collect(DISTINCT dc.path) AS dependentFiles`;

export class PrImpactService {
  constructor(
    private snapshotService: GraphSnapshotService,
    private provider: PullRequestProvider,
    private driver: Driver,
  ) {}

  private async queryDependents(files: string[]): Promise<Dependents> {
    if (files.length === 0) return { changedComponents: [], symbols: [], dependentFiles: [] };
    const session = this.driver.session();
    try {
      const res = await session.run(DEPENDENTS_QUERY, { files });
      const rec = res.records[0];
      const toArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => posix(String(x))) : []);
      return {
        changedComponents: rec ? uniqueSorted(toArr(rec.get('changedComponents'))) : [],
        symbols: rec ? uniqueSorted(toArr(rec.get('symbols'))) : [],
        dependentFiles: rec ? uniqueSorted(toArr(rec.get('dependentFiles'))) : [],
      };
    } finally {
      await session.close();
    }
  }

  /** Knowledge-area labels whose component members match any of the given files. */
  private areasForFiles(
    graph: Awaited<ReturnType<GraphSnapshotService['snapshot']>>,
    files: string[],
  ): string[] {
    const communities = detectCommunities(graph);
    const labelById = new Map(communities.communities.map((c) => [c.id, c.label]));
    const areas = new Set<string>();
    for (const node of graph.nodes) {
      if (node.type !== 'component' && node.type !== 'symbol') continue;
      const sf = node.source_file;
      if (!sf) continue;
      if (files.some((f) => pathMatchesFile(sf, f))) {
        const cid = communities.membership.get(node.id);
        if (cid !== undefined) {
          const label = labelById.get(cid);
          if (label) areas.add(label);
        }
      }
    }
    return [...areas].sort();
  }

  async impact(input: PrImpactInput): Promise<PrImpactResult> {
    const maxItems = input.max_items && input.max_items > 0 ? Math.floor(input.max_items) : 10;
    const changed = uniqueSorted((await this.provider.getChangedFiles(input.pr)).map(posix));
    const dep = await this.queryDependents(changed);

    const graph = await this.snapshotService.snapshot({
      project_tag: input.project_tag,
      project_name: input.project_name,
      include_semantics: false,
      include_facts: false,
      include_sources: false,
      include_aspects: false,
    });
    const touchedFiles = uniqueSorted([...changed, ...dep.dependentFiles]);
    const areas = this.areasForFiles(graph, touchedFiles);
    const core = rankCoreNodes(graph, 50).filter(
      (cn) => graph.nodes.find((n) => n.id === cn.id)?.source_file &&
        touchedFiles.some((f) => pathMatchesFile(graph.nodes.find((n) => n.id === cn.id)!.source_file!, f)),
    );

    const markdown = this.renderImpact(input.pr, changed, dep, areas, core.slice(0, maxItems), maxItems);
    return { markdown, pr: input.pr, changed_files: changed, impacted_files: dep.dependentFiles, areas };
  }

  async conflicts(input: PrConflictsInput = {}): Promise<PrConflictsResult> {
    const prs =
      input.prs && input.prs.length > 0
        ? await Promise.all(
            input.prs.map(async (id) => ({
              id,
              changed_files: uniqueSorted((await this.provider.getChangedFiles(id)).map(posix)),
            })),
          )
        : (await this.provider.listOpenPullRequests()).map((p) => ({
            id: p.id,
            changed_files: uniqueSorted(p.changed_files.map(posix)),
          }));

    const impactSets = new Map<string, Set<string>>();
    for (const pr of prs) {
      const dep = await this.queryDependents(pr.changed_files);
      impactSets.set(pr.id, new Set([...pr.changed_files, ...dep.dependentFiles]));
    }

    const ids = prs.map((p) => p.id).sort();
    const conflicts: PrConflictPair[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const sa = impactSets.get(a)!;
        const sb = impactSets.get(b)!;
        const shared = [...sa].filter((x) => sb.has(x)).sort();
        if (shared.length > 0) conflicts.push({ a, b, shared_files: shared });
      }
    }
    return { markdown: this.renderConflicts(conflicts), conflicts };
  }

  private renderImpact(
    pr: string,
    changed: string[],
    dep: Dependents,
    areas: string[],
    core: ReturnType<typeof rankCoreNodes>,
    maxItems: number,
  ): string {
    const lines: string[] = [`# PR ${pr} — Impact`, ''];
    lines.push(`- Changed files: ${changed.length}`);
    lines.push(`- Directly-defined symbols: ${dep.symbols.length}`);
    lines.push(`- Dependent files (blast radius): ${dep.dependentFiles.length}`);
    lines.push('');
    lines.push('## Changed Files');
    lines.push('');
    if (changed.length === 0) lines.push('_No changed files reported._');
    else for (const f of changed.slice(0, maxItems)) lines.push(`- ${f}`);
    lines.push('');
    lines.push('## Dependent Files (may need review)');
    lines.push('');
    if (dep.dependentFiles.length === 0) lines.push('No files depend on the changed code (by import/call edges).');
    else for (const f of dep.dependentFiles.slice(0, maxItems)) lines.push(`- ${f}`);
    lines.push('');
    lines.push('## Knowledge Areas Touched');
    lines.push('');
    if (areas.length === 0) lines.push('No distinct knowledge areas identified.');
    else for (const a of areas.slice(0, maxItems)) lines.push(`- ${a}`);
    lines.push('');
    lines.push('## High-Centrality Nodes Touched');
    lines.push('');
    if (core.length === 0) lines.push('None of the touched files rank as high-centrality nodes.');
    else for (const c of core) lines.push(`- ${c.label} (weighted degree ${c.weighted_degree})`);
    lines.push('');
    return lines.join('\n');
  }

  private renderConflicts(conflicts: PrConflictPair[]): string {
    const lines: string[] = ['# PR Conflict Analysis', ''];
    if (conflicts.length === 0) {
      lines.push('No overlapping impact between the analyzed PRs.');
      lines.push('');
      return lines.join('\n');
    }
    lines.push(`${conflicts.length} potentially conflicting PR pair(s):`);
    lines.push('');
    for (const c of conflicts) {
      lines.push(`## PR ${c.a} ⨯ PR ${c.b}`);
      lines.push('');
      lines.push(`Shared impacted files (${c.shared_files.length}):`);
      for (const f of c.shared_files.slice(0, 10)) lines.push(`- ${f}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}
