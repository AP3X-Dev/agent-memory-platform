// packages/wiki/src/tools.ts
import { z } from 'zod';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { CompileInput, CompileResult, CompileV2Result, IngestInput, IngestResult, LintInput, LintResult, LintCheck } from './types.js';
import type { ReconcileInput, ReconcileResult } from './reconcile.js';
import { parseFrontmatter } from './reconcile.js';
import { readEnv } from '@memberry/core';

// ─── Service interfaces (injected, no concrete imports) ──────────────────────

export interface IWikiCompiler {
  compile(input: CompileInput): Promise<CompileResult | CompileV2Result>;
}

export interface IIngestionService {
  ingest(input: IngestInput): Promise<IngestResult>;
}

export interface IWikiLinter {
  lint(input: LintInput): Promise<LintResult>;
}

export interface IEditReconciler {
  reconcile(input: ReconcileInput): Promise<ReconcileResult>;
}

// ─── Service container ────────────────────────────────────────────────────────
//
// The wiki tool layer depends on a single typed container of services rather than
// a scatter of module-level singletons. A process-default container backs the
// legacy setWikiServiceInstances() injection point, while buildWikiToolHandlers()
// and registerWikiTools() also accept an explicit container — the seam that makes
// per-session / multi-tenant service isolation possible without process globals.

export interface WikiServiceContainer {
  wikiCompiler: IWikiCompiler | null;
  ingestionService: IIngestionService | null;
  wikiLinter: IWikiLinter | null;
  editReconciler: IEditReconciler | null;
}

/** Build a container, defaulting any service not supplied to null. */
export function createWikiContainer(partial: Partial<WikiServiceContainer> = {}): WikiServiceContainer {
  return {
    wikiCompiler: partial.wikiCompiler ?? null,
    ingestionService: partial.ingestionService ?? null,
    wikiLinter: partial.wikiLinter ?? null,
    editReconciler: partial.editReconciler ?? null,
  };
}

/** Process-default container, populated by setWikiServiceInstances() at bootstrap. */
const defaultContainer: WikiServiceContainer = createWikiContainer();

export function setWikiServiceInstances(services: {
  wikiCompiler: IWikiCompiler;
  ingestionService: IIngestionService;
  wikiLinter: IWikiLinter;
  editReconciler?: IEditReconciler;
}): void {
  // Full reset of the default container (a service omitted from `services` is
  // cleared). Mirrors @memberry/mcp setServiceInstances() reset semantics.
  defaultContainer.wikiCompiler = services.wikiCompiler;
  defaultContainer.ingestionService = services.ingestionService;
  defaultContainer.wikiLinter = services.wikiLinter;
  defaultContainer.editReconciler = services.editReconciler ?? null;
}

// ─── Tool name constants ──────────────────────────────────────────────────────

export const WIKI_TOOL_NAMES = ['berry_compile', 'berry_ingest', 'berry_lint', 'berry_braindump', 'berry_wiki_sync'] as const;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const AmpCompileSchema = {
  project_tag: z.string().max(500).describe('Project tag to scope compilation (e.g. "project:oni-core")'),
  output_dir: z.string().max(1000).describe('Output directory for compiled wiki'),
  format: z.enum(['obsidian', 'plain']).optional().default('obsidian').describe('Output format'),
  emit_graph: z.boolean().optional().default(true).describe('Also emit graph metadata files (_graph/)'),
  entities: z.array(z.string()).optional().describe('Only compile specific entities (empty = all)'),
};

const AmpIngestSchema = {
  source_path: z.string().max(2000).describe('Path to the source document to ingest'),
  source_type: z.enum(['article', 'paper', 'repo', 'dataset', 'note', 'reference']).describe('Type of source material'),
  project_tag: z.string().max(500).describe('Project tag to scope this ingestion'),
  title: z.string().max(500).optional().describe('Title for the source (auto-detected if omitted)'),
  entities: z.array(z.string()).optional().describe('Pre-extracted entity names to link'),
  claims: z.array(z.object({
    content: z.string().max(2000).describe('The claim text'),
    about: z.array(z.string()).describe('Entity names this claim is about'),
    confidence: z.number().min(0).max(1).optional().default(0.3).describe('Initial confidence'),
    tags: z.array(z.string()).optional().describe('Domain tags for this claim'),
  })).optional().describe('Pre-extracted claims to store as semantic nodes'),
  tags: z.array(z.string()).optional().describe('Tags to apply to all extracted claims'),
};

const AmpBraindumpSchema = {
  content: z.string().max(50000).optional().describe('Inline freeform text to remember (the brain dump). Either this or source_path is required.'),
  source_path: z.string().max(2000).optional().describe('Path to a file to ingest instead of inline content'),
  scope: z.string().max(500).describe('Project tag to file this under, e.g. "project:user-personal". Created if new.'),
  title: z.string().max(500).optional().describe('Title for the dump (auto-detected if omitted)'),
  tags: z.array(z.string()).optional().describe('Extra domain tags to apply (e.g. "preferences", "role")'),
  confidence: z.number().min(0).max(1).optional().describe('Base confidence for extracted claims (default 0.7 for human input)'),
  entities: z.array(z.string()).optional().describe('Pre-named entities to link (else auto-extracted)'),
  claims: z.array(z.object({
    content: z.string().max(2000),
    about: z.array(z.string()),
    confidence: z.number().min(0).max(1).optional(),
    tags: z.array(z.string()).optional(),
  })).optional().describe('Pre-structured claims (skip LLM extraction)'),
  compile: z.boolean().optional().default(false).describe('Recompile this scope into its wiki after ingesting'),
};

const AmpWikiSyncSchema = {
  path: z.string().max(2000).describe('Path to a human-edited wiki markdown file to reconcile back into the graph'),
  project_tag: z.string().max(500).optional().describe('Project tag to scope new claims (defaults to the file frontmatter / project: tag)'),
};

const AmpLintSchema = {
  project_tag: z.string().max(500).describe('Project tag to scope the lint'),
  checks: z.array(z.enum([
    'broken_links', 'orphan_pages', 'missing_links', 'redirect_candidates',
    'link_density', 'hub_detection', 'contradictions', 'low_confidence',
    'stale_sources', 'coverage_gaps',
  ])).optional().describe('Which checks to run (empty = all)'),
  thresholds: z.object({
    orphan_min_links: z.number().int().optional().describe('Min inbound links before flagging as orphan (default: 0)'),
    missing_link_min_cooccurrence: z.number().int().optional().describe('Min co-occurrences before suggesting RELATES_TO (default: 3)'),
    low_confidence_max: z.number().optional().describe('Max confidence to flag as low (default: 0.3)'),
    hub_min_links: z.number().int().optional().describe('Min inbound links to flag as hub (default: 10)'),
  }).optional().describe('Threshold overrides'),
};

// ─── Path validation ─────────────────────────────────────────────────────────

/**
 * Returns the allowed base directory for file access.
 * Uses MEMBERRY_INGEST_ALLOW_DIR env var if set, otherwise falls back to cwd.
 */
export function getAllowedBaseDir(): string {
  return path.resolve(readEnv('MEMBERRY_INGEST_ALLOW_DIR') ?? process.cwd());
}

/**
 * Validates that a resolved path is within the allowed base directory.
 * Prevents directory traversal attacks (e.g., ../../etc/passwd).
 */
export function validatePath(inputPath: string, baseDir?: string): string {
  const base = baseDir ?? getAllowedBaseDir();
  const resolved = path.resolve(inputPath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path must be within allowed directory (${base}): ${inputPath}`);
  }
  return resolved;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Handler implementations ─────────────────────────────────────────────────

export type WikiToolHandlers = {
  berry_compile: (args: {
    project_tag: string;
    output_dir: string;
    format?: 'obsidian' | 'plain';
    emit_graph?: boolean;
    entities?: string[];
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  berry_ingest: (args: {
    source_path: string;
    source_type: 'article' | 'paper' | 'repo' | 'dataset' | 'note' | 'reference';
    project_tag: string;
    title?: string;
    entities?: string[];
    claims?: Array<{ content: string; about: string[]; confidence?: number; tags?: string[] }>;
    tags?: string[];
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  berry_lint: (args: {
    project_tag: string;
    checks?: LintCheck[];
    thresholds?: {
      orphan_min_links?: number;
      missing_link_min_cooccurrence?: number;
      low_confidence_max?: number;
      hub_min_links?: number;
    };
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  berry_braindump: (args: {
    content?: string;
    source_path?: string;
    scope: string;
    title?: string;
    tags?: string[];
    confidence?: number;
    entities?: string[];
    claims?: Array<{ content: string; about: string[]; confidence?: number; tags?: string[] }>;
    compile?: boolean;
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  berry_wiki_sync: (args: {
    path: string;
    project_tag?: string;
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
};

export function buildWikiToolHandlers(container: WikiServiceContainer = defaultContainer): WikiToolHandlers {
  // Destructure once into closure-captured locals. Handlers reference these by
  // the same names they used as module globals, so their bodies are unchanged —
  // but each call to buildWikiToolHandlers can now be bound to a different container.
  const { wikiCompiler, ingestionService, wikiLinter, editReconciler } = container;
  return {
    async berry_compile(args) {
      if (!wikiCompiler) throw new Error('WikiCompiler not initialised');

      // Validate output_dir is within allowed directory
      validatePath(args.output_dir);

      const input: CompileInput = {
        project_tag: args.project_tag,
        output_dir: args.output_dir,
        format: args.format ?? 'obsidian',
        emit_graph: args.emit_graph ?? true,
        entities: args.entities,
      };
      const result = await wikiCompiler.compile(input);
      return textContent(JSON.stringify(result, null, 2));
    },

    async berry_ingest(args) {
      if (!ingestionService) throw new Error('IngestionService not initialised');

      // Validate source_path is within allowed directory
      validatePath(args.source_path);

      const input: IngestInput = {
        source_path: args.source_path,
        source_type: args.source_type,
        project_tag: args.project_tag,
        title: args.title,
        entities: args.entities,
        claims: args.claims,
        tags: args.tags,
      };
      const result = await ingestionService.ingest(input);
      return textContent(JSON.stringify(result, null, 2));
    },

    async berry_braindump(args) {
      if (!ingestionService) throw new Error('IngestionService not initialised');
      if (!args.content && !args.source_path) {
        throw new Error('berry_braindump requires either `content` or `source_path`');
      }
      if (args.source_path) validatePath(args.source_path);

      const scope = args.scope.startsWith('project:') ? args.scope : `project:${args.scope}`;
      const result = await ingestionService.ingest({
        content: args.content,
        source_path: args.source_path,
        source_type: 'note',
        project_tag: scope,
        title: args.title,
        entities: args.entities,
        claims: args.claims,
        tags: args.tags,
        author: 'human',
        ensure_project: true,
        base_confidence: args.confidence,
      });

      let compiled: string | undefined;
      if (args.compile && wikiCompiler) {
        try {
          await wikiCompiler.compile({ project_tag: scope, output_dir: '/home/cerebro/projects/amp/wiki', format: 'obsidian', emit_graph: true });
          compiled = scope;
        } catch (err) {
          compiled = `compile failed: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      }

      return textContent(JSON.stringify({ ...result, scope, compiled }, null, 2));
    },

    async berry_wiki_sync(args) {
      if (!editReconciler) throw new Error('WikiEditReconciler not initialised');
      validatePath(args.path);
      const editedMd = await readFile(args.path, 'utf-8');
      const fm = parseFrontmatter(editedMd);
      const projectTag = args.project_tag
        ?? fm.tags.find((t) => t.startsWith('project:'))
        ?? 'project:unscoped';
      const result = await editReconciler.reconcile({ project_tag: projectTag, edited_md: editedMd });
      return textContent(JSON.stringify(result, null, 2));
    },

    async berry_lint(args) {
      if (!wikiLinter) throw new Error('WikiLinter not initialised');
      const input: LintInput = {
        project_tag: args.project_tag,
        checks: args.checks,
        thresholds: args.thresholds,
      };
      const result = await wikiLinter.lint(input);

      // Format as readable markdown
      const lines: string[] = [
        `# Wiki Lint Report`,
        '',
        result.summary,
        '',
      ];

      for (const [name, checkResult] of Object.entries(result.checks)) {
        const icon = checkResult.passed ? 'PASS' : 'ISSUES';
        lines.push(`## [${icon}] ${name}`);
        lines.push('');
        if (checkResult.issues.length === 0) {
          lines.push('No issues found.');
        } else {
          for (const issue of checkResult.issues) {
            const prefix = issue.severity === 'error' ? 'ERROR' : issue.severity === 'warning' ? 'WARN' : 'INFO';
            lines.push(`- **[${prefix}]** ${issue.message}`);
            if (issue.suggestion) {
              lines.push(`  - Suggestion: ${issue.suggestion}`);
            }
          }
        }
        lines.push('');
      }

      return textContent(lines.join('\n'));
    },
  };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerWikiTools(server: McpServer, container: WikiServiceContainer = defaultContainer): RegisteredTool[] {
  const handlers = buildWikiToolHandlers(container);
  const handles: RegisteredTool[] = [];

  handles.push(server.tool(
    'berry_compile',
    'Compile the MemBerry knowledge graph into a navigable wiki of interlinked markdown pages. Each entity becomes an article with [[wikilinks]], backlinks, hierarchy, see-also, and source citations. Generates index files and optional graph metadata.',
    AmpCompileSchema,
    // Non-empty: an empty `{}` makes the MCP SDK misparse the handler slot
    // ("typedHandler is not a function"). See ANN_WRITE note in @memberry/mcp tools.ts.
    { readOnlyHint: false } satisfies ToolAnnotations,
    handlers.berry_compile,
  ));

  handles.push(server.tool(
    'berry_ingest',
    'Ingest a raw source document into the MemBerry graph. Creates a Source node and stores pre-extracted entities and claims as Entity and Semantic nodes with CITES/ABOUT relationships. Handles text/markdown directly and converts documents (PDF, Word/.docx, Excel/.xlsx, HTML, RTF) to text first when the needed system tools are installed. Use this to feed research material, articles, notes, contracts, reports, or org docs into the knowledge base.',
    AmpIngestSchema,
    { openWorldHint: true } satisfies ToolAnnotations,
    handlers.berry_ingest,
  ));

  handles.push(server.tool(
    'berry_lint',
    'Run health checks on the wiki knowledge graph. Detects orphan pages, broken links, missing relationships, duplicate entities, contradictions, low-confidence claims, stale sources, and coverage gaps. Returns actionable suggestions.',
    AmpLintSchema,
    { readOnlyHint: true } satisfies ToolAnnotations,
    handlers.berry_lint,
  ));

  handles.push(server.tool(
    'berry_braindump',
    'Capture a human brain dump into MemBerry as durable, human-authored memory. Turns freeform text (your role, preferences, tech stack, how you like AI to respond) into graph knowledge under a custom scope (e.g. project:user-personal) while keeping the verbatim text as a Source. Auto-extracts entities and claims, creates the scope if new, and optionally compiles that scope into its own wiki. Use when the user says "remember this about me".',
    AmpBraindumpSchema,
    { openWorldHint: true } satisfies ToolAnnotations,
    handlers.berry_braindump,
  ));

  handles.push(server.tool(
    'berry_wiki_sync',
    'Reconcile a human-edited wiki markdown file back into the graph. Changed claims become corrections (supersede), newly added lines become new human-authored memories, using the hidden per-claim anchors emitted by berry_compile. The complement to the wiki viewer Edit button for agent/CLI-driven edits.',
    AmpWikiSyncSchema,
    { openWorldHint: true } satisfies ToolAnnotations,
    handlers.berry_wiki_sync,
  ));

  return handles;
}
