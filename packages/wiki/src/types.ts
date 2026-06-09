// packages/wiki/src/types.ts

import type { Driver } from 'neo4j-driver';

// ─── Compilation ─────────────────────────────────────────────────────────────

export interface CompileInput {
  /** Project tag to scope compilation (e.g. "project:oni-core") */
  project_tag: string;
  /** Output directory for compiled wiki */
  output_dir: string;
  /** Output format */
  format: 'obsidian' | 'plain';
  /** Also emit graph metadata files (_graph/) */
  emit_graph?: boolean;
  /** Only compile specific entities (empty = all) */
  entities?: string[];
}

export interface CompileResult {
  /** Number of entity articles compiled */
  articles_compiled: number;
  /** Number of index files generated */
  indexes_generated: number;
  /** Number of [[wikilinks]] resolved */
  links_resolved: number;
  /** Number of backlinks rendered */
  backlinks_rendered: number;
  /** Output directory path */
  output_dir: string;
  /** Graph files emitted (if emit_graph was true) */
  graph_files?: string[];
}

export interface WikiArticle {
  /** Entity this article is about */
  entity: EntityInfo;
  /** YAML frontmatter fields */
  frontmatter: ArticleFrontmatter;
  /** Sections of the article body */
  sections: ArticleSection[];
  /** Backlinks: entities that reference this one */
  backlinks: BacklinkEntry[];
  /** See-also: related entities */
  see_also: SeeAlsoEntry[];
  /** Source citations */
  sources: SourceCitation[];
}

export interface ArticleFrontmatter {
  entity: string;
  type: string;
  confidence: number;
  sources: number;
  inbound_links: number;
  last_compiled: string;
  amp_id: string;
  aliases: string[];
  tags: string[];
  parent?: string;
  children?: string[];
}

export interface ArticleSection {
  heading: string;
  /** Domain tag this section is grouped by (e.g. "architecture", "performance") */
  domain_tag?: string;
  /** Claims in this section, with inline [[wikilinks]] already resolved */
  claims: ResolvedClaim[];
}

export interface ResolvedClaim {
  content: string;
  confidence: number;
  amp_id: string;
  source_refs: string[];
  /** Entity names referenced inline (for link resolution) */
  entity_refs: string[];
}

export interface BacklinkEntry {
  entity_name: string;
  entity_slug: string;
  context: string;
}

export interface SeeAlsoEntry {
  entity_name: string;
  entity_slug: string;
  context: string;
  /** Co-occurrence weight or explicit relation */
  weight: number;
}

export interface SourceCitation {
  id: string;
  title: string;
  source_type: string;
  slug: string;
}

// ─── Entity info from graph ──────────────────────────────────────────────────

export interface EntityInfo {
  id: string;
  name: string;
  type: string;
  slug: string;
  description?: string;
  aliases?: string[];
  created_at: string;
}

// ─── Ingestion ───────────────────────────────────────────────────────────────

export interface IngestInput {
  /** Path to the source document. Optional when `content` is supplied inline. */
  source_path?: string;
  /** Inline source text (brain dumps). Alternative to reading from `source_path`. */
  content?: string;
  /** Type of source material */
  source_type: 'article' | 'paper' | 'repo' | 'dataset' | 'note' | 'reference';
  /** Project tag to scope this ingestion */
  project_tag: string;
  /** Title for the source (auto-detected from content if omitted) */
  title?: string;
  /** Pre-extracted entities to link (in addition to auto-extracted) */
  entities?: string[];
  /** Pre-extracted claims (in addition to auto-extracted) */
  claims?: Array<{
    content: string;
    about: string[];
    confidence?: number;
    tags?: string[];
  }>;
  /** Tags to apply to all extracted claims */
  tags?: string[];
  /** Default confidence for claims that don't specify one (default 0.3). */
  base_confidence?: number;
  /** Decay class for created semantics (default 'volatile'). Human dumps use 'stable'. */
  decay_class?: 'volatile' | 'stable' | 'permanent';
  /** Authorship — 'human' marks content human-authored (durable, higher trust). */
  author?: 'human' | 'agent';
  /** Create the project Entity if it doesn't exist (lets fresh user scopes spring up). */
  ensure_project?: boolean;
}

export interface IngestResult {
  /** Source node ID created in the graph */
  source_id: string;
  /** Entities created or linked */
  entities_created: number;
  entities_linked: number;
  /** Claims stored as semantic nodes */
  claims_stored: number;
  /** CITES relationships created */
  citations_created: number;
}

// ─── Linting ─────────────────────────────────────────────────────────────────

export type LintCheck =
  | 'broken_links'
  | 'orphan_pages'
  | 'missing_links'
  | 'redirect_candidates'
  | 'link_density'
  | 'hub_detection'
  | 'contradictions'
  | 'low_confidence'
  | 'stale_sources'
  | 'coverage_gaps';

export interface LintInput {
  /** Project tag to scope the lint */
  project_tag: string;
  /** Which checks to run (empty = all) */
  checks?: LintCheck[];
  /** Thresholds */
  thresholds?: {
    /** Minimum inbound links before flagging as orphan (default: 0) */
    orphan_min_links?: number;
    /** Minimum co-occurrences before suggesting a RELATES_TO (default: 3) */
    missing_link_min_cooccurrence?: number;
    /** Max confidence to flag as low (default: 0.3) */
    low_confidence_max?: number;
    /** Min inbound links to flag as hub (default: 10) */
    hub_min_links?: number;
  };
}

export interface LintResult {
  /** Check results keyed by check name */
  checks: Record<string, LintCheckResult>;
  /** Total number of issues found */
  total_issues: number;
  /** Summary text */
  summary: string;
}

export interface LintCheckResult {
  check: LintCheck;
  issues: LintIssue[];
  passed: boolean;
}

export interface LintIssue {
  severity: 'info' | 'warning' | 'error';
  entity?: string;
  message: string;
  suggestion?: string;
}

// ─── Viewer ──────────────────────────────────────────────────────────────────

export interface ViewerConfig {
  /** Port to serve on (default: 3200) */
  port: number;
  /** Wiki directory to serve */
  wiki_dir: string;
  /** Project tag for graph queries */
  project_tag: string;
  /**
   * Neo4j driver. When provided, the viewer enables the editable round-trip:
   * an Edit button on entity articles + POST /api/edit reconcile back into the
   * graph. Omit it to keep the viewer strictly read-only.
   */
  driver?: Driver;
}

// ─── Episodic rendering ──────────────────────────────────────────────────────

export interface EpisodicEntry {
  id: string;
  task: string;
  content: string;
  outcome: string | null;
  session_id: string;
  created_at: string;
  /** Project tag extracted from task prefix, e.g. "agent-assist" */
  project_scope: string | null;
}

// ─── Project-scoped compilation ──────────────────────────────────────────────

export interface ProjectData {
  entity: EntityInfo;
  entities: EntityInfo[];
  /** Entities that pass the content threshold (get dedicated pages) */
  substantive_entities: EntityInfo[];
  /** Entities below threshold (listed as one-liners) */
  sparse_entities: EntityInfo[];
  /** All episodic entries scoped to this project */
  episodics: EpisodicEntry[];
  /** Semantic nodes scoped to this project */
  semantics: Array<{ id: string; content: string; confidence: number; tags: string[]; entities: string[] }>;
}

// ─── Library ─────────────────────────────────────────────────────────────────

export interface SourceInfo {
  id: string;
  title: string;
  source_type: string;
  path: string;
  project_tag: string;
  created_at: string;
}

export interface LibraryPage {
  source: SourceInfo;
  claims: ResolvedClaim[];
  entity_links: string[];
}

// ─── Topics ──────────────────────────────────────────────────────────────────

export interface TopicData {
  tag: string;
  slug: string;
  /** Semantic nodes carrying this tag */
  semantics: Array<{ content: string; confidence: number; project: string; entities: string[] }>;
  /** Episodic entries related to this tag's domain */
  episodics: EpisodicEntry[];
  /** Projects this tag appears in */
  projects: string[];
  /** Co-occurring tags */
  related_tags: string[];
  /** Entities whose semantics carry this tag */
  related_entities: string[];
}

// ─── Portal homepage ─────────────────────────────────────────────────────────

export interface PortalData {
  projects: Array<{
    name: string;
    slug: string;
    description: string | null;
    entity_count: number;
    semantic_count: number;
    episodic_count: number;
    last_activity: string | null;
  }>;
  recent_changes: EpisodicEntry[];
  top_decisions: Array<{ content: string; confidence: number; project: string; entities: string[] }>;
  stats: {
    total_entities: number;
    /** Raw temporal Fact nodes (distinct from consolidated Semantic nodes). */
    total_facts: number;
    total_semantics: number;
    total_episodics: number;
    total_sources: number;
    total_projects: number;
    /** High-confidence decisions (semantics ≥ threshold, non-internal projects). */
    total_decisions: number;
    /** Tags spanning ≥2 projects (cross-project patterns). */
    total_patterns: number;
    /** Topic pages generated. */
    total_topics: number;
  };
}

// ─── Updated CompileResult ───────────────────────────────────────────────────

export interface CompileV2Result {
  projects_compiled: number;
  articles_compiled: number;
  episodics_rendered: number;
  library_pages: number;
  topic_pages: number;
  cross_project_pages: number;
  output_dir: string;
}
