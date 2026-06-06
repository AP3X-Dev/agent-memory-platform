// Structural (non-tree-sitter) extractors: conservative, regex/JSON-based symbol
// extraction for SQL, Terraform/HCL, and MCP config files. Each returns plain
// SymbolNode[] in the same shape the tree-sitter path produces, so downstream
// indexing/search works unchanged.
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { SupportedLanguage, SymbolKind, SymbolNode } from '../types.js';

export interface StructuralExtractor {
  language: SupportedLanguage;
  extract(filePath: string, source: string, now: string): SymbolNode[];
}

/** 1-based line number of a character offset. */
export function lineOf(source: string, index: number): number {
  let line = 1;
  const end = Math.min(index, source.length);
  for (let i = 0; i < end; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/** First line of text starting at `index` (for a compact, single-line signature). */
export function firstLine(source: string, index: number): string {
  const nl = source.indexOf('\n', index);
  return source.slice(index, nl === -1 ? source.length : nl).trim();
}

export function makeSymbol(p: {
  name: string;
  kind: SymbolKind;
  language: SupportedLanguage;
  filePath: string;
  startLine: number;
  endLine?: number;
  signature: string;
  now: string;
}): SymbolNode {
  const content_hash = createHash('sha1')
    .update(`${p.filePath}|${p.kind}|${p.name}|${p.signature}`)
    .digest('hex');
  return {
    id: `sym-${nanoid(12)}`,
    name: p.name,
    kind: p.kind,
    language: p.language,
    file_path: p.filePath,
    start_line: p.startLine,
    end_line: p.endLine ?? p.startLine,
    signature: p.signature.slice(0, 300),
    doc_comment: '',
    content_hash,
    parent_symbol: null,
    created_at: p.now,
    updated_at: p.now,
  };
}
