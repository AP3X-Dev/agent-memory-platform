// packages/wiki/src/renderers.ts
// Pure rendering functions: data in, markdown out.

import type {
  ArticleFrontmatter,
  EntityInfo,
  EpisodicEntry,
  ProjectData,
  SourceInfo,
  LibraryPage,
  TopicData,
  PortalData,
  ResolvedClaim,
} from './types.js';
import { slugify } from './compile.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3).trimEnd() + '...';
}

// ─── Round-trip claim anchors ──────────────────────────────────────────────────
// Each canonical claim is tagged with a hidden HTML comment carrying its Semantic
// node id. HTML comments are invisible in rendered markdown (and in Obsidian), but
// let the edit reconciler map an edited claim block back to the exact graph node.
// See reconcile.ts (parseClaimBlocks) and viewer.ts (anchors stripped before render).

/** Matches a claim anchor and captures the semantic id. Global+multiline for scanning. */
export const CLAIM_ANCHOR_RE = /<!--\s*amp:(sem-[A-Za-z0-9_-]+)\s*-->/g;

/** Render a hidden anchor that ties a rendered claim to its Semantic node id. */
export function claimAnchor(id: string): string {
  return `<!-- amp:${id} -->`;
}

function formatDate(iso: string): string {
  if (!iso) return 'unknown';
  return iso.slice(0, 10);
}

function outcomeBadge(outcome: string | null): string {
  if (!outcome) return '';
  return ` **[${outcome.toUpperCase()}]**`;
}

function stripProjectPrefix(text: string): string {
  return text.replace(/^\[project:[^\]]+\]\s*/, '');
}

function projectEntityLink(projectSlug: string, entityName: string, display?: string): string {
  const entitySlug = slugify(entityName);
  const label = display ?? entityName;
  return `[[projects/${projectSlug}/${entitySlug}|${label}]]`;
}

function projectIndexLink(projectSlug: string, display?: string): string {
  const label = display ?? projectSlug;
  return `[[projects/${projectSlug}/_index|${label}]]`;
}

function libraryLink(sourceTitle: string, display?: string): string {
  const slug = slugify(sourceTitle);
  const label = display ?? sourceTitle;
  return `[[library/${slug}|${label}]]`;
}

function topicLink(tag: string, display?: string): string {
  const slug = slugify(tag);
  const label = display ?? tag;
  return `[[topics/${slug}|${label}]]`;
}

function projectSlugFromName(projectName: string): string | null {
  const normalized = projectName.replace(/^project:/i, '').trim();
  if (!normalized || normalized.toLowerCase() === 'unscoped') return null;
  const slug = slugify(normalized);
  return slug || null;
}

function scopedEntityLink(projectName: string, entityName: string): string {
  const projectSlug = projectSlugFromName(projectName);
  return projectSlug ? projectEntityLink(projectSlug, entityName) : `**${entityName}**`;
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────

export function renderFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ─── Entity Article ──────────────────────────────────────────────────────────

export function renderEntityArticle(
  article: {
    entity: EntityInfo;
    frontmatter: ArticleFrontmatter;
    sections: Array<{ heading: string; claims: ResolvedClaim[] }>;
    backlinks: Array<{ entity_name: string; context: string }>;
    see_also: Array<{ entity_name: string; context: string }>;
    sources: Array<{ title: string; source_type: string; slug: string }>;
    hierarchy: { parent?: string; children: string[] };
    projectSlug: string;
  },
  episodics: EpisodicEntry[],
): string {
  const lines: string[] = [];
  const { entity, frontmatter, sections, backlinks, see_also, sources, hierarchy, projectSlug } = article;

  // Frontmatter
  lines.push(renderFrontmatter({
    entity: frontmatter.entity,
    type: frontmatter.type,
    confidence: frontmatter.confidence > 0 ? frontmatter.confidence.toFixed(2) : 'n/a',
    sources: frontmatter.sources,
    inbound_links: frontmatter.inbound_links,
    last_compiled: frontmatter.last_compiled,
    amp_id: frontmatter.amp_id,
    aliases: frontmatter.aliases,
    tags: frontmatter.tags,
    parent: frontmatter.parent,
    children: frontmatter.children,
  }));
  lines.push('');

  // Title
  lines.push(`# ${entity.name}`);
  lines.push('');

  // Hierarchy
  if (hierarchy.parent) {
    lines.push(`> Part of: ${projectEntityLink(projectSlug, hierarchy.parent)}`);
  }
  if (hierarchy.children.length > 0) {
    const childLinks = hierarchy.children.map((c) => projectEntityLink(projectSlug, c)).join(', ');
    lines.push(`> Contains: ${childLinks}`);
  }
  if (hierarchy.parent || hierarchy.children.length > 0) {
    lines.push('');
  }

  // Description
  if (entity.description) {
    lines.push(entity.description);
    lines.push('');
  }

  // Key decisions (high-confidence claims)
  const decisions = sections
    .flatMap((s) => s.claims)
    .filter((c) => c.confidence >= 0.8)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  if (decisions.length > 0) {
    lines.push('## Key Decisions');
    lines.push('');
    for (const d of decisions) {
      lines.push(`- ${truncate(d.content, 200)} *(${d.confidence.toFixed(2)})*`);
    }
    lines.push('');
  }

  // Domain sections (grouped claims). These are the *canonical* rendering of each
  // claim — anchor them so human edits round-trip back to the graph. (The Key
  // Decisions block above is a derived duplicate and is deliberately NOT anchored.)
  for (const section of sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');
    for (const claim of section.claims) {
      lines.push(claim.content);
      if (claim.confidence < 1.0) {
        lines.push(`*(confidence: ${claim.confidence.toFixed(2)})*`);
      }
      if (claim.amp_id) {
        lines.push(claimAnchor(claim.amp_id));
      }
      lines.push('');
    }
  }

  // History (episodic entries)
  if (episodics.length > 0) {
    lines.push('## History');
    lines.push('');
    for (const ep of episodics.slice(0, 15)) {
      const date = formatDate(ep.created_at);
      const badge = outcomeBadge(ep.outcome);
      const task = truncate(stripProjectPrefix(ep.task), 120);
      lines.push(`> **${date}**${badge} -- ${task}`);
      lines.push(`> ${truncate(stripProjectPrefix(ep.content), 300)}`);
      lines.push('');
    }
  }

  // Sources
  if (sources.length > 0) {
    lines.push('## Sources');
    lines.push('');
    for (const src of sources) {
      lines.push(`- ${libraryLink(src.title)} *(${src.source_type})*`);
    }
    lines.push('');
  }

  // See also
  if (see_also.length > 0) {
    lines.push('## See Also');
    lines.push('');
    for (const sa of see_also) {
      lines.push(`- ${projectEntityLink(projectSlug, sa.entity_name)} -- ${sa.context}`);
    }
    lines.push('');
  }

  // Backlinks
  if (backlinks.length > 0) {
    lines.push('## Referenced By');
    lines.push('');
    for (const bl of backlinks) {
      const ctx = bl.context ? ` -- ${truncate(bl.context, 100)}` : '';
      lines.push(`- ${projectEntityLink(projectSlug, bl.entity_name)}${ctx}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Project Index ───────────────────────────────────────────────────────────

export function renderProjectIndex(project: ProjectData): string {
  const lines: string[] = [];
  const projectSlug = slugify(project.entity.name);

  lines.push(renderFrontmatter({
    project: project.entity.name,
    compiled: new Date().toISOString().split('T')[0],
    entities: project.entities.length,
    semantics: project.semantics.length,
    episodics: project.episodics.length,
  }));
  lines.push('');

  lines.push(`# ${project.entity.name}`);
  lines.push('');

  if (project.entity.description) {
    lines.push(project.entity.description);
    lines.push('');
  }

  const decisions = project.semantics
    .filter((s) => s.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  if (decisions.length > 0) {
    lines.push('## Key Decisions');
    lines.push('');
    for (const d of decisions) {
      lines.push(`- ${truncate(d.content, 180)} *(${d.confidence.toFixed(2)})*`);
    }
    lines.push('');
  }

  // Substantive entities grouped by type
  if (project.substantive_entities.length > 0) {
    const byType = new Map<string, EntityInfo[]>();
    for (const e of project.substantive_entities) {
      const list = byType.get(e.type) ?? [];
      list.push(e);
      byType.set(e.type, list);
    }

    for (const [type, entities] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
      lines.push('');
      for (const e of entities.sort((a, b) => a.name.localeCompare(b.name))) {
        const desc = e.description ? ` -- ${truncate(e.description, 80)}` : '';
        lines.push(`- ${projectEntityLink(projectSlug, e.name)}${desc}`);
      }
      lines.push('');
    }
  }

  // Sparse entities as one-liners (no pages, plain text)
  if (project.sparse_entities.length > 0) {
    lines.push('## Other Entities');
    lines.push('');
    const names = project.sparse_entities
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => `**${e.name}** *(${e.type})*`);
    lines.push(names.join(' \u00b7 '));
    lines.push('');
  }

  // Activity summary
  if (project.episodics.length > 0) {
    lines.push('## Recent Activity');
    lines.push('');
    const sessions = new Set(project.episodics.map((e) => e.session_id));
    lines.push(`*${project.episodics.length} entries across ${sessions.size} session(s)*`);
    lines.push('');

    for (const ep of project.episodics.slice(0, 10)) {
      const date = formatDate(ep.created_at);
      const badge = outcomeBadge(ep.outcome);
      const task = truncate(stripProjectPrefix(ep.task), 100);
      lines.push(`- **${date}**${badge} ${task}`);
    }
    lines.push('');
  }

  // Graph
  lines.push(`## Graph`);
  lines.push('');
  lines.push(`See [[projects/${projectSlug}/_graph|Knowledge Graph]]`);
  lines.push('');

  return lines.join('\n');
}

// ─── Portal Homepage ─────────────────────────────────────────────────────────

export function renderPortalHomepage(data: PortalData): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: 'MemBerry Knowledge Portal',
    compiled: new Date().toISOString().split('T')[0],
  }));
  lines.push('');

  lines.push('# MemBerry Knowledge Portal');
  lines.push('');

  // Stats bar
  const s = data.stats;
  lines.push(`> **${s.total_projects}** projects \u00b7 **${s.total_entities}** entities \u00b7 **${s.total_semantics}** semantic facts \u00b7 **${s.total_episodics}** session entries \u00b7 **${s.total_sources}** sources`);
  lines.push('');

  // Nav links
  lines.push('**Navigate:** [[_decisions|Decisions]] \u00b7 [[_patterns|Patterns]] \u00b7 [[_recent|Recent Changes]] \u00b7 [[library/_index|Library]] \u00b7 [[topics/_index|Topics]]');
  lines.push('');

  // Project directory
  lines.push('## Projects');
  lines.push('');
  lines.push('| Project | Entities | Facts | Sessions | Last Activity |');
  lines.push('| ------- | -------: | ----: | -------: | ------------- |');

  for (const p of data.projects.sort((a, b) => a.name.localeCompare(b.name))) {
    const link = projectIndexLink(p.slug, p.name);
    const lastAct = p.last_activity ? formatDate(p.last_activity) : '\u2014';
    lines.push(`| ${link} | ${p.entity_count} | ${p.semantic_count} | ${p.episodic_count} | ${lastAct} |`);
  }
  lines.push('');

  // Top decisions
  if (data.top_decisions.length > 0) {
    lines.push('## Top Decisions');
    lines.push('');
    for (const d of data.top_decisions.slice(0, 10)) {
      const projSlug = slugify(d.project);
      let suffix = '';
      if (d.entities.length > 0) {
        const entities = d.entities.map((e) => projectEntityLink(projSlug, e)).join(', ');
        suffix = ` -- ${entities}`;
      }
      lines.push(`- ${truncate(d.content, 180)} *(${d.confidence.toFixed(2)})*${suffix}`);
    }
    lines.push('');
  }

  // Recent changes
  if (data.recent_changes.length > 0) {
    lines.push('## Recent Changes');
    lines.push('');
    for (const ep of data.recent_changes.slice(0, 8)) {
      const date = formatDate(ep.created_at);
      const badge = outcomeBadge(ep.outcome);
      const scope = ep.project_scope ? `[${ep.project_scope}] ` : '';
      const task = truncate(stripProjectPrefix(ep.task), 100);
      lines.push(`- **${date}**${badge} ${scope}${task}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Library Index ───────────────────────────────────────────────────────────

export function renderLibraryIndex(sources: SourceInfo[], claimCounts: Map<string, number>): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: 'Source Library',
    compiled: new Date().toISOString().split('T')[0],
    sources: sources.length,
  }));
  lines.push('');

  lines.push('# Source Library');
  lines.push('');
  lines.push(`*${sources.length} sources indexed*`);
  lines.push('');

  // Group by type
  const byType = new Map<string, SourceInfo[]>();
  for (const src of sources) {
    const list = byType.get(src.source_type) ?? [];
    list.push(src);
    byType.set(src.source_type, list);
  }

  for (const [type, typeSources] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
    lines.push('');
    for (const src of typeSources.sort((a, b) => a.title.localeCompare(b.title))) {
      const count = claimCounts.get(src.id) ?? 0;
      const countStr = count > 0 ? ` -- ${count} claim(s)` : '';
      lines.push(`- ${libraryLink(src.title)}${countStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Library Page ────────────────────────────────────────────────────────────

export function renderLibraryPage(page: LibraryPage): string {
  const lines: string[] = [];
  const projectName = page.source.project_tag.replace(/^project:/i, '');

  lines.push(renderFrontmatter({
    title: page.source.title,
    source_type: page.source.source_type,
    project_tag: page.source.project_tag,
    created_at: page.source.created_at,
  }));
  lines.push('');

  lines.push(`# ${page.source.title}`);
  lines.push('');
  lines.push(`**Type:** ${page.source.source_type} \u00b7 **Project:** ${page.source.project_tag} \u00b7 **Added:** ${formatDate(page.source.created_at)}`);
  lines.push('');

  if (page.source.path) {
    lines.push(`**Path:** \`${page.source.path}\``);
    lines.push('');
  }

  // Claims
  if (page.claims.length > 0) {
    lines.push('## Claims');
    lines.push('');
    for (const claim of page.claims) {
      const entityLinks = claim.entity_refs
        .map((e) => scopedEntityLink(projectName, e))
        .join(', ');
      const refs = entityLinks ? ` -> ${entityLinks}` : '';
      lines.push(`- ${claim.content} *(${claim.confidence.toFixed(2)})*${refs}`);
    }
    lines.push('');
  }

  // Entity links
  if (page.entity_links.length > 0) {
    lines.push('## Related Entities');
    lines.push('');
    for (const name of page.entity_links) {
      lines.push(`- ${scopedEntityLink(projectName, name)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Topic Index ─────────────────────────────────────────────────────────────

export function renderTopicIndex(topics: TopicData[]): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: 'Topics',
    compiled: new Date().toISOString().split('T')[0],
    topics: topics.length,
  }));
  lines.push('');

  lines.push('# Topics');
  lines.push('');

  lines.push('| Topic | Facts | Projects |');
  lines.push('| ----- | ----: | -------- |');

  for (const t of topics.sort((a, b) => b.semantics.length - a.semantics.length)) {
    const link = topicLink(t.tag);
    const projects = t.projects.join(', ');
    lines.push(`| ${link} | ${t.semantics.length} | ${projects} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Topic Page ──────────────────────────────────────────────────────────────

export function renderTopicPage(topic: TopicData): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: topic.tag,
    projects: topic.projects,
    facts: topic.semantics.length,
  }));
  lines.push('');

  lines.push(`# ${topic.tag}`);
  lines.push('');
  lines.push(`*Appears in ${topic.projects.length} project(s) with ${topic.semantics.length} fact(s)*`);
  lines.push('');

  // Semantics grouped by project
  const byProject = new Map<string, typeof topic.semantics>();
  for (const sem of topic.semantics) {
    const proj = sem.project || 'unscoped';
    const list = byProject.get(proj) ?? [];
    list.push(sem);
    byProject.set(proj, list);
  }

  for (const [proj, sems] of [...byProject].sort(([a], [b]) => a.localeCompare(b))) {
    const projSlug = projectSlugFromName(proj);
    lines.push(`## ${projSlug ? projectIndexLink(projSlug, proj) : 'Unscoped'}`);
    lines.push('');
    for (const sem of sems) {
      const entityLinks = sem.entities
        .map((e) => projSlug ? projectEntityLink(projSlug, e) : `**${e}**`)
        .join(', ');
      const refs = entityLinks ? ` -> ${entityLinks}` : '';
      lines.push(`- ${truncate(sem.content, 200)} *(${sem.confidence.toFixed(2)})*${refs}`);
    }
    lines.push('');
  }

  // Related topics
  if (topic.related_tags.length > 0) {
    lines.push('## Related Topics');
    lines.push('');
    lines.push(topic.related_tags.map((t) => topicLink(t)).join(' \u00b7 '));
    lines.push('');
  }

  // Related entities
  if (topic.related_entities.length > 0) {
    lines.push('## Related Entities');
    lines.push('');
    const projectsByEntity = new Map<string, Set<string>>();
    for (const sem of topic.semantics) {
      for (const entity of sem.entities) {
        if (!topic.related_entities.includes(entity)) continue;
        const projects = projectsByEntity.get(entity) ?? new Set<string>();
        projects.add(sem.project);
        projectsByEntity.set(entity, projects);
      }
    }

    for (const name of topic.related_entities) {
      const projects = [...(projectsByEntity.get(name) ?? [])].sort();
      if (projects.length === 0) {
        lines.push(`- **${name}**`);
      } else {
        lines.push(`- ${projects.map((project) => scopedEntityLink(project, name)).join(' · ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Decisions Page ──────────────────────────────────────────────────────────

export function renderDecisionsPage(semantics: Array<{
  id: string; content: string; confidence: number; tags: string[]; entities: string[];
}>): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: 'All Decisions',
    compiled: new Date().toISOString().split('T')[0],
  }));
  lines.push('');

  lines.push('# Decisions');
  lines.push('');
  lines.push('High-confidence claims and decisions across all projects, sorted by confidence.');
  lines.push('');

  // Group by project tag
  const byProject = new Map<string, typeof semantics>();
  for (const sem of semantics) {
    const projectTag = sem.tags.find((t) => t.startsWith('project:'));
    const proj = projectTag ? projectTag.replace('project:', '') : 'unscoped';
    const list = byProject.get(proj) ?? [];
    list.push(sem);
    byProject.set(proj, list);
  }

  for (const [proj, sems] of [...byProject].sort(([a], [b]) => a.localeCompare(b))) {
    const projSlug = slugify(proj);
    lines.push(`## ${proj === 'unscoped' ? 'Unscoped' : projectIndexLink(projSlug, proj)}`);
    lines.push('');
    const sorted = sems.sort((a, b) => b.confidence - a.confidence).slice(0, 30);
    for (const sem of sorted) {
      let refs = '';
      if (sem.entities.length > 0 && proj !== 'unscoped') {
        const entityLinks = sem.entities
          .map((e) => projectEntityLink(projSlug, e))
          .join(', ');
        refs = ` -- ${entityLinks}`;
      } else if (sem.entities.length > 0) {
        // Unscoped: render entity names as plain text
        refs = ` -- ${sem.entities.map((e) => `**${e}**`).join(', ')}`;
      }
      lines.push(`- ${truncate(sem.content, 200)} *(${sem.confidence.toFixed(2)})*${refs}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Patterns Page ───────────────────────────────────────────────────────────

export function renderPatternsPage(semantics: Array<{
  id: string; content: string; confidence: number; tags: string[]; entities: string[];
}>): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: 'Cross-Project Patterns',
    compiled: new Date().toISOString().split('T')[0],
  }));
  lines.push('');

  lines.push('# Cross-Project Patterns');
  lines.push('');
  lines.push('Tags and patterns that appear across multiple projects.');
  lines.push('');

  // Find tags that span multiple projects
  const tagProjects = new Map<string, Set<string>>();
  for (const sem of semantics) {
    const projectTag = sem.tags.find((t) => t.startsWith('project:'));
    const proj = projectTag ? projectTag.replace('project:', '') : 'unscoped';
    for (const tag of sem.tags) {
      if (tag.startsWith('project:')) continue;
      const projects = tagProjects.get(tag) ?? new Set();
      projects.add(proj);
      tagProjects.set(tag, projects);
    }
  }

  // Only keep tags appearing in 2+ projects
  const crossProjectTags = [...tagProjects.entries()]
    .filter(([, projects]) => projects.size >= 2)
    .sort(([, a], [, b]) => b.size - a.size);

  if (crossProjectTags.length === 0) {
    lines.push('*No cross-project patterns detected yet.*');
    lines.push('');
    return lines.join('\n');
  }

  for (const [tag, projects] of crossProjectTags) {
    const projectList = [...projects].sort().join(', ');
    lines.push(`## ${topicLink(tag)} *(${projects.size} projects: ${projectList})*`);
    lines.push('');

    const tagSems = semantics
      .filter((s) => s.tags.includes(tag))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    for (const sem of tagSems) {
      const projectTag = sem.tags.find((t) => t.startsWith('project:'));
      const proj = projectTag ? projectTag.replace('project:', '') : 'unscoped';
      lines.push(`- [${proj}] ${truncate(sem.content, 180)} *(${sem.confidence.toFixed(2)})*`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Recent Changes ──────────────────────────────────────────────────────────

export function renderRecentChanges(episodics: EpisodicEntry[]): string {
  const lines: string[] = [];

  lines.push(renderFrontmatter({
    title: 'Recent Changes',
    compiled: new Date().toISOString().split('T')[0],
    entries: episodics.length,
  }));
  lines.push('');

  lines.push('# Recent Changes');
  lines.push('');

  if (episodics.length === 0) {
    lines.push('*No recent activity.*');
    lines.push('');
    return lines.join('\n');
  }

  // Group by date
  const byDate = new Map<string, EpisodicEntry[]>();
  for (const ep of episodics) {
    const date = formatDate(ep.created_at);
    const list = byDate.get(date) ?? [];
    list.push(ep);
    byDate.set(date, list);
  }

  for (const [date, entries] of [...byDate]) {
    lines.push(`## ${date}`);
    lines.push('');
    for (const ep of entries) {
      const badge = outcomeBadge(ep.outcome);
      const scope = ep.project_scope ? `**[${ep.project_scope}]** ` : '';
      const task = truncate(stripProjectPrefix(ep.task), 120);
      lines.push(`> ${scope}${task}${badge}`);
      lines.push(`> *Session: ${ep.session_id}*`);
      lines.push(`> ${truncate(stripProjectPrefix(ep.content), 400)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Project Graph ───────────────────────────────────────────────────────────

export function renderProjectGraph(project: ProjectData): string {
  const lines: string[] = [];

  lines.push(`# ${project.entity.name} -- Knowledge Graph`);
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph LR');

  const emitted = new Set<string>();
  const projectSlug = slugify(project.entity.name);
  const projectNodeId = projectSlug.replace(/-/g, '_');

  // Project root
  lines.push(`  ${projectNodeId}["${project.entity.name}"]:::project`);

  // Entities — show ALL children (substantive + sparse), not just substantive,
  // so freshly-bootstrapped modules appear before they accumulate semantic/episodic
  // mentions. Substantive ones get the default :::project class via inherited link;
  // sparse ones get :::sparse so the user can see they're stubs.
  for (const e of project.substantive_entities) {
    const nodeId = slugify(e.name).replace(/-/g, '_');
    const key = `${projectNodeId}-->${nodeId}`;
    if (!emitted.has(key)) {
      lines.push(`  ${projectNodeId} --> ${nodeId}["${e.name}"]`);
      emitted.add(key);
    }
  }
  for (const e of project.sparse_entities) {
    const nodeId = slugify(e.name).replace(/-/g, '_');
    const key = `${projectNodeId}-->${nodeId}`;
    if (!emitted.has(key)) {
      lines.push(`  ${projectNodeId} --> ${nodeId}["${e.name}"]:::sparse`);
      emitted.add(key);
    }
  }

  lines.push('');
  lines.push('  classDef project fill:#9b35ff,color:#ffffff,stroke:#9b35ff');
  lines.push('  classDef sparse fill:#1a1a1a,color:#888,stroke:#2a2a2a,stroke-dasharray:3 3');
  lines.push('```');

  return lines.join('\n');
}
