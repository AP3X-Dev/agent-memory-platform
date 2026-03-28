// packages/code/src/parser.ts
// Tree-sitter AST parsing across multiple languages.
// Extracts symbols, call relationships, and import information.

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import type {
  SupportedLanguage,
  SymbolNode,
  SymbolRelation,
  ParsedFile,
  ImportInfo,
  SymbolKind,
} from './types.js';

// ─── Tree-sitter lazy loading ─────────────────────────────────────────────────
// Grammars loaded on first use per language to avoid loading all at startup.

let Parser: typeof import('tree-sitter').default | null = null;

const grammarCache = new Map<SupportedLanguage, unknown>();

async function getParser(): Promise<typeof import('tree-sitter').default> {
  if (!Parser) {
    const mod = await import('tree-sitter');
    Parser = mod.default;
  }
  return Parser;
}

async function getGrammar(language: SupportedLanguage): Promise<unknown> {
  if (grammarCache.has(language)) return grammarCache.get(language)!;

  let grammar: unknown;
  switch (language) {
    case 'typescript':
      grammar = (await import('tree-sitter-typescript')).typescript;
      break;
    case 'javascript':
      grammar = (await import('tree-sitter-javascript')).default;
      break;
    case 'python':
      grammar = (await import('tree-sitter-python')).default;
      break;
    case 'go':
      grammar = (await import('tree-sitter-go')).default;
      break;
    case 'rust':
      grammar = (await import('tree-sitter-rust')).default;
      break;
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
  grammarCache.set(language, grammar);
  return grammar;
}

// ─── Main parse function ──────────────────────────────────────────────────────

export async function parseFile(
  filePath: string,
  language: SupportedLanguage,
): Promise<ParsedFile> {
  const source = await readFile(filePath, 'utf-8');
  const TreeSitter = await getParser();
  const grammar = await getGrammar(language);

  const parser = new TreeSitter();
  parser.setLanguage(grammar as Parameters<typeof parser.setLanguage>[0]);
  const tree = parser.parse(source);

  const symbols: SymbolNode[] = [];
  const relations: SymbolRelation[] = [];
  const imports: ImportInfo[] = [];
  const now = new Date().toISOString();

  // Walk the AST
  walkNode(tree.rootNode, null);

  function walkNode(node: ReturnType<typeof tree.rootNode.child>, parentSymbolId: string | null): void {
    if (!node) return;

    const extracted = extractSymbol(node, language, filePath, source, parentSymbolId, now);
    if (extracted) {
      symbols.push(extracted.symbol);
      relations.push(...extracted.relations);

      // Walk children with this symbol as parent
      for (let i = 0; i < node.childCount; i++) {
        walkNode(node.child(i), extracted.symbol.id);
      }
      return;
    }

    // Extract imports
    const imp = extractImport(node, language, filePath);
    if (imp) imports.push(imp);

    // Walk children with same parent
    for (let i = 0; i < node.childCount; i++) {
      walkNode(node.child(i), parentSymbolId);
    }
  }

  return { file_path: filePath, language, symbols, relations, imports };
}

// ─── Symbol extraction (language-specific) ────────────────────────────────────

interface ExtractedSymbol {
  symbol: SymbolNode;
  relations: SymbolRelation[];
}

function extractSymbol(
  node: { type: string; text: string; startPosition: { row: number }; endPosition: { row: number }; childCount: number; child(i: number): typeof node | null; childForFieldName?(name: string): typeof node | null },
  language: SupportedLanguage,
  filePath: string,
  source: string,
  parentSymbolId: string | null,
  now: string,
): ExtractedSymbol | null {
  const nodeType = node.type;
  let kind: SymbolKind | null = null;
  let name = '';
  let signature = '';
  let docComment = '';

  // ─── TypeScript / JavaScript ───────────────────────────────────────
  if (language === 'typescript' || language === 'javascript') {
    if (nodeType === 'function_declaration' || nodeType === 'arrow_function' || nodeType === 'function') {
      kind = 'function';
      name = node.childForFieldName?.('name')?.text ?? extractName(node) ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'class_declaration') {
      kind = 'class';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'method_definition') {
      kind = 'method';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'interface_declaration') {
      kind = 'interface';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'type_alias_declaration') {
      kind = 'type';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'enum_declaration') {
      kind = 'enum';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'lexical_declaration' || nodeType === 'variable_declaration') {
      // Only top-level exports / named constants
      const declarator = node.child(0)?.type === 'export_statement' ? node.child(0)?.child(1) : node.child(1);
      if (declarator?.childForFieldName?.('name')) {
        kind = 'variable';
        name = declarator.childForFieldName('name')?.text ?? '';
        signature = extractFirstLine(node.text);
      }
    }
  }

  // ─── Python ────────────────────────────────────────────────────────
  if (language === 'python') {
    if (nodeType === 'function_definition') {
      kind = parentSymbolId ? 'method' : 'function';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'class_definition') {
      kind = 'class';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    }
  }

  // ─── Go ────────────────────────────────────────────────────────────
  if (language === 'go') {
    if (nodeType === 'function_declaration') {
      kind = 'function';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'method_declaration') {
      kind = 'method';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'type_declaration') {
      kind = 'type';
      const spec = node.child(1);
      name = spec?.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    }
  }

  // ─── Rust ──────────────────────────────────────────────────────────
  if (language === 'rust') {
    if (nodeType === 'function_item') {
      kind = 'function';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'impl_item') {
      kind = 'class'; // impl block treated as class-like
      name = node.childForFieldName?.('type')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'struct_item') {
      kind = 'class';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'enum_item') {
      kind = 'enum';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'trait_item') {
      kind = 'interface';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    }
  }

  if (!kind || !name) return null;

  const id = `sym-${nanoid(12)}`;
  const contentHash = createHash('sha256').update(node.text).digest('hex').slice(0, 16);

  // Look for preceding doc comment
  docComment = extractDocComment(node, source);

  const symbol: SymbolNode = {
    id,
    name,
    kind,
    language,
    file_path: filePath,
    start_line: node.startPosition.row + 1,
    end_line: node.endPosition.row + 1,
    signature,
    doc_comment: docComment,
    content_hash: contentHash,
    parent_symbol: parentSymbolId,
    created_at: now,
    updated_at: now,
  };

  const relations: SymbolRelation[] = [];

  // If this symbol has a parent, create SYMBOL_CONTAINS
  if (parentSymbolId) {
    relations.push({
      from_symbol: parentSymbolId,
      to_symbol: id,
      type: 'SYMBOL_CONTAINS',
    });
  }

  // Detect inheritance (class extends / implements)
  const heritage = detectHeritage(node, language);
  for (const base of heritage.extends) {
    relations.push({ from_symbol: id, to_symbol: base, type: 'SYMBOL_INHERITS' });
  }
  for (const iface of heritage.implements) {
    relations.push({ from_symbol: id, to_symbol: iface, type: 'SYMBOL_IMPLEMENTS' });
  }

  return { symbol, relations };
}

// ─── Import extraction ────────────────────────────────────────────────────────

function extractImport(
  node: { type: string; text: string; startPosition: { row: number }; childForFieldName?(name: string): typeof node | null; childCount: number; child(i: number): typeof node | null },
  language: SupportedLanguage,
  filePath: string,
): ImportInfo | null {
  if (language === 'typescript' || language === 'javascript') {
    if (node.type === 'import_statement') {
      const source = node.childForFieldName?.('source')?.text?.replace(/['"]/g, '') ?? '';
      const specifiers: string[] = [];
      // Extract named imports
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'import_clause') {
          specifiers.push(child.text);
        }
      }
      if (source) {
        return { source, specifiers, file_path: filePath, line: node.startPosition.row + 1 };
      }
    }
  }

  if (language === 'python') {
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      const text = node.text;
      const match = text.match(/from\s+([\w.]+)\s+import|import\s+([\w.]+)/);
      const source = match?.[1] ?? match?.[2] ?? '';
      if (source) {
        return { source, specifiers: [], file_path: filePath, line: node.startPosition.row + 1 };
      }
    }
  }

  if (language === 'go') {
    if (node.type === 'import_declaration') {
      const specifiers: string[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child?.type === 'import_spec') {
          specifiers.push(child.text.replace(/"/g, ''));
        }
      }
      return { source: specifiers.join(', '), specifiers, file_path: filePath, line: node.startPosition.row + 1 };
    }
  }

  if (language === 'rust') {
    if (node.type === 'use_declaration') {
      return { source: node.text, specifiers: [], file_path: filePath, line: node.startPosition.row + 1 };
    }
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractFirstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 200 ? line.slice(0, 200) + '...' : line;
}

function extractName(node: { childCount: number; child(i: number): { type: string; text: string } | null }): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'identifier' || child?.type === 'property_identifier') {
      return child.text;
    }
  }
  return null;
}

function extractDocComment(
  node: { startPosition: { row: number } },
  source: string,
): string {
  const lines = source.split('\n');
  const startRow = node.startPosition.row;
  if (startRow === 0) return '';

  // Look backwards for doc comments
  const docLines: string[] = [];
  for (let i = startRow - 1; i >= Math.max(0, startRow - 20); i--) {
    const line = lines[i]?.trim() ?? '';
    if (line.startsWith('*') || line.startsWith('/**') || line.startsWith('///') ||
        line.startsWith('#') || line.startsWith('//') || line.startsWith('"""') ||
        line.startsWith("'''")) {
      docLines.unshift(line);
    } else if (line === '' && docLines.length > 0) {
      break;
    } else if (line === '') {
      continue;
    } else {
      break;
    }
  }

  return docLines.join('\n').slice(0, 500);
}

function detectHeritage(
  node: { text: string; childCount: number; child(i: number): { type: string; text: string } | null },
  language: SupportedLanguage,
): { extends: string[]; implements: string[] } {
  const result = { extends: [] as string[], implements: [] as string[] };
  const text = node.text;

  if (language === 'typescript' || language === 'javascript') {
    const extendsMatch = text.match(/extends\s+(\w+)/);
    if (extendsMatch) result.extends.push(extendsMatch[1]);
    const implMatch = text.match(/implements\s+([\w,\s]+)/);
    if (implMatch) {
      result.implements.push(...implMatch[1].split(',').map((s) => s.trim()).filter(Boolean));
    }
  }

  if (language === 'python') {
    const match = text.match(/class\s+\w+\s*\(([^)]+)\)/);
    if (match) {
      result.extends.push(...match[1].split(',').map((s) => s.trim()).filter(Boolean));
    }
  }

  if (language === 'rust') {
    // impl Trait for Type
    const implMatch = text.match(/impl\s+(\w+)\s+for/);
    if (implMatch) result.implements.push(implMatch[1]);
  }

  return result;
}
