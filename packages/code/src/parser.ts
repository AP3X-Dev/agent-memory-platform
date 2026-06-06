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
import { isExtractorLanguage, extractStructured } from './extractors/registry.js';

// ─── Tree-sitter lazy loading ─────────────────────────────────────────────────
// Grammars loaded on first use per language to avoid loading all at startup.

/** Minimal typed interface for tree-sitter Parser. */
interface TSParser {
  new(): TSParserInstance;
}
interface TSParserInstance {
  setLanguage(language: unknown): void;
  parse(input: string): { rootNode: TSSyntaxNode };
}
interface TSSyntaxNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child(index: number): TSSyntaxNode | null;
  childForFieldName?(name: string): TSSyntaxNode | null;
}

let ParserClass: TSParser | null = null;

const grammarCache = new Map<SupportedLanguage, unknown>();

async function getParser(): Promise<TSParser> {
  if (!ParserClass) {
    const mod = await import('tree-sitter');
    ParserClass = (mod.default ?? mod) as TSParser;
  }
  return ParserClass;
}

async function getGrammar(language: SupportedLanguage): Promise<unknown> {
  if (grammarCache.has(language)) return grammarCache.get(language)!;

  let grammar: unknown;
  switch (language) {
    case 'typescript':
      grammar = grammarFromModule(await import('tree-sitter-typescript'), 'typescript');
      break;
    case 'javascript':
      grammar = grammarFromModule(await import('tree-sitter-javascript'));
      break;
    case 'python':
      grammar = grammarFromModule(await import('tree-sitter-python'));
      break;
    case 'go':
      grammar = grammarFromModule(await import('tree-sitter-go'));
      break;
    case 'rust':
      grammar = grammarFromModule(await import('tree-sitter-rust'));
      break;
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
  grammarCache.set(language, grammar);
  return grammar;
}

function grammarFromModule(mod: unknown, exportName?: string): unknown {
  const record = asRecord(mod);
  const defaultRecord = asRecord(record.default);
  const base = Object.keys(defaultRecord).length > 0 ? defaultRecord : record;
  if (exportName) {
    return base[exportName] ?? record[exportName];
  }
  return record.default ?? mod;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

// ─── Main parse function ──────────────────────────────────────────────────────

export async function parseFile(
  filePath: string,
  language: SupportedLanguage,
): Promise<ParsedFile> {
  const source = await readFile(filePath, 'utf-8');

  // Non-tree-sitter formats (SQL, Terraform/HCL, MCP config) use conservative
  // structural extractors instead of an AST grammar.
  if (isExtractorLanguage(language)) {
    return extractStructured(filePath, language, source, new Date().toISOString());
  }

  const TSParser = await getParser();
  const grammar = await getGrammar(language);

  const parser = new TSParser();
  parser.setLanguage(grammar);
  const tree = parser.parse(source);

  const symbols: SymbolNode[] = [];
  const relations: SymbolRelation[] = [];
  const callRelations: SymbolRelation[] = [];
  const imports: ImportInfo[] = [];
  const now = new Date().toISOString();

  // Walk the AST
  walkNode(tree.rootNode, null);

  function walkNode(node: TSSyntaxNode | null, parentSymbolId: string | null): void {
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

    const call = extractCallRelation(node, language, parentSymbolId);
    if (call) callRelations.push(call);

    // Walk children with same parent
    for (let i = 0; i < node.childCount; i++) {
      walkNode(node.child(i), parentSymbolId);
    }
  }

  const allowedCallNames = buildAllowedCallNameSet(symbols, imports);
  relations.push(...callRelations.filter((rel) => allowedCallNames.has(rel.to_symbol)));

  // Pure barrel/re-export files (`export { x } from './y'`, an `index.ts` that only
  // re-exports, a Python `__init__.py` that only re-imports) declare no symbols of
  // their own. Without an anchor node, `resolveImports` has no `from:Symbol` to hang
  // the SYMBOL_IMPORTS edge on, so the module dependency is silently lost. Emit a
  // single synthetic `module` symbol (a kind already whitelisted by the resolver) so
  // these files participate in the import graph in both directions.
  if (symbols.length === 0 && imports.length > 0) {
    symbols.push(buildModuleSymbol(filePath, language, imports, now));
  }

  return { file_path: filePath, language, symbols, relations, imports };
}

/**
 * Build a synthetic `module` symbol representing a file as a whole.
 * Used as an import-graph anchor for files that declare no symbols of their own
 * (barrel/re-export modules). The content hash is derived from the file's import
 * sources so incremental indexing reindexes when the module's dependencies change.
 */
function buildModuleSymbol(
  filePath: string,
  language: SupportedLanguage,
  imports: ImportInfo[],
  now: string,
): SymbolNode {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const hashInput = imports
    .map((imp) => `${imp.source}::${imp.specifiers.join(',')}`)
    .sort()
    .join('|');
  const contentHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  return {
    id: `sym-${nanoid(12)}`,
    name,
    kind: 'module',
    language,
    file_path: filePath,
    start_line: 1,
    end_line: 1,
    signature: `module ${name}`,
    doc_comment: '',
    content_hash: contentHash,
    parent_symbol: null,
    created_at: now,
    updated_at: now,
  };
}

// ─── Symbol extraction (language-specific) ────────────────────────────────────

interface ExtractedSymbol {
  symbol: SymbolNode;
  relations: SymbolRelation[];
}

function extractSymbol(
  node: TSSyntaxNode,
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
    if (nodeType === 'function_declaration') {
      kind = 'function';
      name = node.childForFieldName?.('name')?.text ?? extractName(node) ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'arrow_function' || nodeType === 'function' || nodeType === 'function_expression') {
      return null;
    } else if (nodeType === 'class_declaration') {
      kind = 'class';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'method_definition') {
      kind = 'method';
      name = node.childForFieldName?.('name')?.text ?? '';
      signature = extractFirstLine(node.text);
    } else if (nodeType === 'pair') {
      const value = node.childForFieldName?.('value') ?? null;
      if (isFunctionInitializer(value)) {
        kind = 'method';
        name = objectPropertyName(node.childForFieldName?.('key') ?? node.child(0));
        signature = extractFirstLine(node.text);
      }
    } else if (isClassFieldDefinition(node)) {
      const value = node.childForFieldName?.('value') ?? null;
      if (isFunctionInitializer(value)) {
        kind = 'method';
        name = node.childForFieldName?.('name')?.text ?? '';
        signature = extractFirstLine(node.text);
      }
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
      const declarator = findVariableDeclarator(node);
      if (declarator?.childForFieldName?.('name')) {
        const value = variableDeclaratorValue(declarator);
        kind = isFunctionInitializer(value) ? 'function' : 'variable';
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
  node: TSSyntaxNode,
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

    // Re-exports (`export { x } from './y'`, `export * from './y'`,
    // `export * as ns from './y'`) are module dependencies just like imports.
    // A plain `export { x }` or `export default ...` has no `source` field and
    // is a local export, not a cross-file edge --- skip those.
    if (node.type === 'export_statement') {
      const source = node.childForFieldName?.('source')?.text?.replace(/['"]/g, '') ?? '';
      if (source) {
        const specifiers: string[] = [];
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child?.type === 'export_clause') {
            specifiers.push(child.text);
          }
        }
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

// ─── Call relationship extraction ────────────────────────────────────────────

function extractCallRelation(
  node: TSSyntaxNode,
  language: SupportedLanguage,
  parentSymbolId: string | null,
): SymbolRelation | null {
  if (!parentSymbolId || !isCallNode(node, language)) return null;

  const callable =
    node.childForFieldName?.('function') ??
    node.childForFieldName?.('name') ??
    node.childForFieldName?.('constructor') ??
    node.child(0);
  const calleeName = extractCallableName(callable);
  if (!calleeName || calleeName === 'this' || calleeName === 'super') return null;

  return {
    from_symbol: parentSymbolId,
    to_symbol: calleeName,
    type: 'SYMBOL_CALLS',
  };
}

function isCallNode(node: TSSyntaxNode, language: SupportedLanguage): boolean {
  if (node.type === 'call_expression') return true;
  if (language === 'rust' && node.type === 'method_call_expression') return true;
  if ((language === 'typescript' || language === 'javascript') && node.type === 'new_expression') return true;
  return false;
}

function extractCallableName(node: TSSyntaxNode | null): string | null {
  if (!node) return null;

  if (
    node.type === 'identifier' ||
    node.type === 'property_identifier' ||
    node.type === 'field_identifier' ||
    node.type === 'type_identifier'
  ) {
    return sanitizeCallableName(node.text);
  }

  const namedField =
    node.childForFieldName?.('property') ??
    node.childForFieldName?.('field') ??
    node.childForFieldName?.('name') ??
    node.childForFieldName?.('function') ??
    null;
  const fieldName = extractCallableName(namedField);
  if (fieldName) return fieldName;

  for (let i = node.childCount - 1; i >= 0; i--) {
    const name = extractCallableName(node.child(i));
    if (name) return name;
  }

  return null;
}

function sanitizeCallableName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^#/, '');
}

function buildAllowedCallNameSet(symbols: SymbolNode[], imports: ImportInfo[]): Set<string> {
  const allowed = new Set<string>();
  for (const symbol of symbols) {
    allowed.add(symbol.name);
  }
  for (const imp of imports) {
    for (const name of importLocalNames(imp)) {
      allowed.add(name);
    }
  }
  return allowed;
}

function importLocalNames(imp: ImportInfo): string[] {
  const names: string[] = [];
  for (const specifier of imp.specifiers) {
    names.push(...parseImportSpecifierNames(specifier));
  }
  return names;
}

function parseImportSpecifierNames(specifier: string): string[] {
  return specifier
    .replace(/[{}]/g, ',')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const noType = part.replace(/^type\s+/, '').trim();
      const alias = noType.match(/\bas\s+([A-Za-z_$][\w$]*)$/)?.[1];
      if (alias) return alias;
      return noType.match(/^([A-Za-z_$][\w$]*)/)?.[1] ?? '';
    })
    .filter(Boolean);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractFirstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 200 ? line.slice(0, 200) + '...' : line;
}

function extractName(node: TSSyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'identifier' || child?.type === 'property_identifier') {
      return child.text;
    }
  }
  return null;
}

function findVariableDeclarator(node: TSSyntaxNode): TSSyntaxNode | null {
  if (node.type === 'variable_declarator') return node;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === 'variable_declarator') return child;
    if (child.type === 'export_statement') {
      const nested = findVariableDeclarator(child);
      if (nested) return nested;
    }
  }
  return null;
}

function variableDeclaratorValue(node: TSSyntaxNode): TSSyntaxNode | null {
  const fieldValue = node.childForFieldName?.('value') ?? null;
  if (fieldValue) return fieldValue;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && isFunctionInitializer(child)) return child;
  }
  return null;
}

function isFunctionInitializer(node: TSSyntaxNode | null): boolean {
  return node?.type === 'arrow_function' || node?.type === 'function' || node?.type === 'function_expression';
}

function isClassFieldDefinition(node: TSSyntaxNode): boolean {
  return node.type === 'public_field_definition' || node.type === 'field_definition' || node.type === 'property_definition';
}

function objectPropertyName(node: TSSyntaxNode | null): string {
  if (!node) return '';
  if (node.type === 'string' || node.type === 'string_fragment') {
    return node.text.replace(/^['"]|['"]$/g, '');
  }
  return node.text;
}

function extractDocComment(
  node: TSSyntaxNode,
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
  node: TSSyntaxNode,
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
