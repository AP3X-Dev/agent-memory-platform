// Conservative SQL DDL extractor: CREATE TABLE/VIEW/FUNCTION/PROCEDURE/TYPE/etc.
import type { SymbolKind, SymbolNode } from '../types.js';
import { firstLine, lineOf, makeSymbol, type StructuralExtractor } from './types.js';

const SQL_RE =
  /\bcreate\s+(?:or\s+replace\s+)?(?:global\s+|local\s+|temp(?:orary)?\s+|unique\s+)?(table|view|materialized\s+view|function|procedure|index|sequence|type|trigger)\s+(?:if\s+not\s+exists\s+)?[`"[]?([A-Za-z_][\w.$]*)[`"\]]?/gi;

function kindFor(keyword: string): SymbolKind {
  const k = keyword.toLowerCase().replace(/\s+/g, ' ');
  if (k === 'table') return 'table';
  if (k === 'view' || k === 'materialized view') return 'view';
  if (k === 'function' || k === 'procedure' || k === 'trigger') return 'function';
  if (k === 'type') return 'type';
  return 'variable'; // index, sequence
}

export const sqlExtractor: StructuralExtractor = {
  language: 'sql',
  extract(filePath, source, now): SymbolNode[] {
    const out: SymbolNode[] = [];
    const seen = new Set<string>();
    SQL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SQL_RE.exec(source)) !== null) {
      const kind = kindFor(m[1]!);
      const name = m[2]!;
      const key = `${kind}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        makeSymbol({
          name,
          kind,
          language: 'sql',
          filePath,
          startLine: lineOf(source, m.index),
          signature: firstLine(source, m.index),
          now,
        }),
      );
    }
    return out;
  },
};
