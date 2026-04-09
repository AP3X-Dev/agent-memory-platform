// packages/wiki/src/tools.ts
import { z } from 'zod';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CompileInput, CompileResult, CompileV2Result, IngestInput, IngestResult, LintInput, LintResult, LintCheck } from './types.js';

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

// ─── Injected instances ───────────────────────────────────────────────────────

let wikiCompiler: IWikiCompiler | null = null;
let ingestionService: IIngestionService | null = null;
let wikiLinter: IWikiLinter | null = null;

export function setWikiServiceInstances(services: {
  wikiCompiler: IWikiCompiler;
  ingestionService: IIngestionService;
  wikiLinter: IWikiLinter;
}): void {
  wikiCompiler = services.wikiCompiler;
  ingestionService = services.ingestionService;
  wikiLinter = services.wikiLinter;
}

// ─── Tool name constants ──────────────────────────────────────────────────────

export const WIKI_TOOL_NAMES = ['amp_compile', 'amp_ingest', 'amp_lint'] as const;

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
 * Uses AMP_INGEST_ALLOW_DIR env var if set, otherwise falls back to cwd.
 */
export function getAllowedBaseDir(): string {
  return path.resolve(process.env['AMP_INGEST_ALLOW_DIR'] ?? process.cwd());
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
  amp_compile: (args: {
    project_tag: string;
    output_dir: string;
    format?: 'obsidian' | 'plain';
    emit_graph?: boolean;
    entities?: string[];
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  amp_ingest: (args: {
    source_path: string;
    source_type: 'article' | 'paper' | 'repo' | 'dataset' | 'note' | 'reference';
    project_tag: string;
    title?: string;
    entities?: string[];
    claims?: Array<{ content: string; about: string[]; confidence?: number; tags?: string[] }>;
    tags?: string[];
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  amp_lint: (args: {
    project_tag: string;
    checks?: LintCheck[];
    thresholds?: {
      orphan_min_links?: number;
      missing_link_min_cooccurrence?: number;
      low_confidence_max?: number;
      hub_min_links?: number;
    };
  }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
};

export function buildWikiToolHandlers(): WikiToolHandlers {
  return {
    async amp_compile(args) {
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

    async amp_ingest(args) {
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

    async amp_lint(args) {
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

export function registerWikiTools(server: McpServer): void {
  const handlers = buildWikiToolHandlers();

  server.tool(
    'amp_compile',
    'Compile the AMP knowledge graph into a navigable wiki of interlinked markdown pages. Each entity becomes an article with [[wikilinks]], backlinks, hierarchy, see-also, and source citations. Generates index files and optional graph metadata.',
    AmpCompileSchema,
    handlers.amp_compile,
  );

  server.tool(
    'amp_ingest',
    'Ingest a raw source document into the AMP graph. Creates a Source node and stores pre-extracted entities and claims as Entity and Semantic nodes with CITES/ABOUT relationships. Use this to feed research material (articles, papers, notes) into the knowledge base.',
    AmpIngestSchema,
    handlers.amp_ingest,
  );

  server.tool(
    'amp_lint',
    'Run health checks on the wiki knowledge graph. Detects orphan pages, broken links, missing relationships, duplicate entities, contradictions, low-confidence claims, stale sources, and coverage gaps. Returns actionable suggestions.',
    AmpLintSchema,
    handlers.amp_lint,
  );
}
