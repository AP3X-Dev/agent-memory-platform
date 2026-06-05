// packages/wiki/src/index.ts

// Types
export type {
  CompileInput,
  CompileResult,
  CompileV2Result,
  WikiArticle,
  ArticleFrontmatter,
  ArticleSection,
  ResolvedClaim,
  BacklinkEntry,
  SeeAlsoEntry,
  SourceCitation,
  EntityInfo,
  EpisodicEntry,
  ProjectData,
  SourceInfo,
  LibraryPage,
  TopicData,
  PortalData,
  IngestInput,
  IngestResult,
  LintInput,
  LintResult,
  LintCheck,
  LintCheckResult,
  LintIssue,
  ViewerConfig,
} from './types.js';

// Services
export { WikiCompiler, slugify } from './compile.js';
export { IngestionService, initWikiSchema } from './ingest.js';
export { WikiLinter } from './lint.js';
export { startWikiViewer, escapeHtml, sanitizeHtml, resetViewerCache, renderMarkdown } from './viewer.js';
export { WikiEditReconciler, parseClaimBlocks, parseFrontmatter } from './reconcile.js';
export type { ReconcileInput, ReconcileResult, ReconcileChange } from './reconcile.js';

// Query functions
export {
  fetchAllProjects,
  fetchEpisodicProjectScopes,
  fetchProjectEntities,
  fetchEntitiesModifiedByProject,
  fetchSemanticsForEntity,
  fetchSemanticCountForEntity,
  fetchEpisodicsForProject,
  fetchEpisodicsForEntity,
  fetchRecentEpisodics,
  fetchHierarchy,
  fetchBacklinks,
  fetchRelatedEntities,
  fetchAllSources,
  fetchClaimsForSource,
  fetchAllTags,
  fetchSemanticsForTag,
  fetchAllSemantics,
  fetchGraphStats,
  fetchInboundLinkCount,
  fetchSourcesForEntity,
  extractProjectScope,
} from './queries.js';

// Renderers
export {
  renderFrontmatter,
  renderEntityArticle,
  renderProjectIndex,
  renderPortalHomepage,
  renderLibraryIndex,
  renderLibraryPage,
  renderTopicIndex,
  renderTopicPage,
  renderDecisionsPage,
  renderPatternsPage,
  renderRecentChanges,
  renderProjectGraph,
  claimAnchor,
  CLAIM_ANCHOR_RE,
} from './renderers.js';

// MCP tools
export { registerWikiTools, setWikiServiceInstances, WIKI_TOOL_NAMES, validatePath, getAllowedBaseDir, buildWikiToolHandlers } from './tools.js';
export type { WikiToolHandlers } from './tools.js';
export type { IWikiCompiler, IIngestionService, IWikiLinter } from './tools.js';
