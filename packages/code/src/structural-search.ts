// packages/code/src/structural-search.ts
// ast-grep backed structural search for JavaScript and TypeScript code.

import { readdir, readFile, stat } from 'fs/promises';
import path from 'node:path';
import { Lang, parse } from '@ast-grep/napi';

export type StructuralSearchLanguage = 'javascript' | 'typescript' | 'tsx';

export interface StructuralSearchOptions {
  pattern: string;
  language?: StructuralSearchLanguage;
  include?: string[];
  exclude?: string[];
  limit?: number;
  max_file_bytes?: number;
}

export interface StructuralSearchCapture {
  text: string;
  kind: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
}

export interface StructuralSearchMatch {
  file_path: string;
  rel_path: string;
  language: StructuralSearchLanguage;
  kind: string;
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
  text: string;
  text_truncated: boolean;
  captures: Record<string, StructuralSearchCapture>;
}

export interface StructuralSearchResult {
  pattern: string;
  files_scanned: number;
  files_skipped: number;
  matches: StructuralSearchMatch[];
  truncated: boolean;
  errors: Array<{ file: string; error: string }>;
}

const DEFAULT_LIMIT = 50;
const MAX_NODE_TEXT = 2000;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.nyc_output',
  '.amp',
  '.lab',
  '.yggdrasil',
  '.codebase',
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const EXTENSION_LANGUAGES: Record<string, StructuralSearchLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'tsx',
};

const NAPI_LANGUAGES: Record<StructuralSearchLanguage, Lang> = {
  javascript: Lang.JavaScript,
  typescript: Lang.TypeScript,
  tsx: Lang.Tsx,
};

export async function structuralSearch(
  rootPath: string,
  options: StructuralSearchOptions,
): Promise<StructuralSearchResult> {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const maxFileBytes = Math.max(1, options.max_file_bytes ?? DEFAULT_MAX_FILE_BYTES);
  const root = path.resolve(rootPath);
  const files = await discoverStructuralSearchFiles(root, options);
  const captureNames = extractMetaVariables(options.pattern);
  const result: StructuralSearchResult = {
    pattern: options.pattern,
    files_scanned: 0,
    files_skipped: 0,
    matches: [],
    truncated: false,
    errors: [],
  };

  for (const file of files) {
    if (result.matches.length >= limit) {
      result.truncated = true;
      break;
    }

    const language = languageForFile(file, options.language);
    if (!language) {
      result.files_skipped++;
      continue;
    }

    try {
      const fileStat = await stat(file);
      if (fileStat.size > maxFileBytes) {
        result.files_skipped++;
        continue;
      }

      const source = await readFile(file, 'utf-8');
      const ast = parse(NAPI_LANGUAGES[language], source);
      result.files_scanned++;
      const nodes = ast.root().findAll(options.pattern);

      for (const node of nodes) {
        if (result.matches.length >= limit) {
          result.truncated = true;
          break;
        }
        result.matches.push(buildMatch(root, file, language, node, captureNames));
      }
    } catch (err) {
      result.errors.push({
        file: relativePath(root, file),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

async function discoverStructuralSearchFiles(
  root: string,
  options: StructuralSearchOptions,
): Promise<string[]> {
  const files: string[] = [];
  const rootStat = await stat(root);

  if (rootStat.isFile()) {
    return shouldIncludeFile(root, root, options) ? [root] : [];
  }

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.resolve(dir, entry.name);
      const rel = relativePath(root, fullPath);

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name, rel, options.exclude)) continue;
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && shouldIncludeFile(root, fullPath, options)) {
        files.push(fullPath);
      }
    }
  }

  await walk(root);
  return files;
}

function shouldSkipDirectory(name: string, relPath: string, exclude?: string[]): boolean {
  if (EXCLUDE_DIRS.has(name) || name.startsWith('.')) return true;
  return matchesAny(relPath, exclude);
}

function shouldIncludeFile(root: string, filePath: string, options: StructuralSearchOptions): boolean {
  const rel = relativePath(root, filePath);
  const name = path.basename(filePath);
  if (EXCLUDE_FILES.has(name)) return false;
  if (!languageForFile(filePath, options.language)) return false;
  if (options.include?.length && !matchesAny(rel, options.include)) return false;
  if (matchesAny(rel, options.exclude)) return false;
  return true;
}

function languageForFile(filePath: string, preferred?: StructuralSearchLanguage): StructuralSearchLanguage | null {
  const inferred = EXTENSION_LANGUAGES[path.extname(filePath).toLowerCase()];
  if (!inferred) return null;
  if (preferred && preferred !== inferred) return null;
  return inferred;
}

function matchesAny(relPath: string, patterns?: string[]): boolean {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => relPath.includes(normalizePattern(pattern)));
}

function normalizePattern(pattern: string): string {
  return pattern.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function relativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function extractMetaVariables(pattern: string): string[] {
  const names = new Set<string>();
  const re = /\$+([A-Z][A-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pattern)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

interface AstGrepNode {
  range(): { start: { line: number; column: number }; end: { line: number; column: number } };
  kind(): string | number;
  text(): string;
  getMatch(name: string): AstGrepNode | null;
}

function buildMatch(
  root: string,
  filePath: string,
  language: StructuralSearchLanguage,
  node: AstGrepNode,
  captureNames: string[],
): StructuralSearchMatch {
  const range = node.range();
  const text = node.text();
  const captures: Record<string, StructuralSearchCapture> = {};

  for (const name of captureNames) {
    const capture = node.getMatch(name);
    if (!capture) continue;
    const captureRange = capture.range();
    captures[name] = {
      text: capture.text(),
      kind: String(capture.kind()),
      start_line: captureRange.start.line + 1,
      start_column: captureRange.start.column + 1,
      end_line: captureRange.end.line + 1,
      end_column: captureRange.end.column + 1,
    };
  }

  return {
    file_path: filePath,
    rel_path: relativePath(root, filePath),
    language,
    kind: String(node.kind()),
    start_line: range.start.line + 1,
    start_column: range.start.column + 1,
    end_line: range.end.line + 1,
    end_column: range.end.column + 1,
    text: text.slice(0, MAX_NODE_TEXT),
    text_truncated: text.length > MAX_NODE_TEXT,
    captures,
  };
}
