// Conservative Terraform/HCL extractor: resource/data/module/variable/output/provider blocks.
import type { SymbolKind, SymbolNode } from '../types.js';
import { firstLine, lineOf, makeSymbol, type StructuralExtractor } from './types.js';

const TF_RE =
  /\b(resource|data|module|variable|output|provider)\s+"([^"]+)"(?:\s+"([^"]+)")?/g;

function tfKind(block: string): SymbolKind {
  if (block === 'resource' || block === 'data') return 'resource';
  if (block === 'module') return 'module';
  if (block === 'variable' || block === 'output') return 'variable';
  return 'config'; // provider
}

export const terraformExtractor: StructuralExtractor = {
  language: 'terraform',
  extract(filePath, source, now): SymbolNode[] {
    const out: SymbolNode[] = [];
    const seen = new Set<string>();
    TF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TF_RE.exec(source)) !== null) {
      const block = m[1]!;
      const name = m[3] ? `${m[2]}.${m[3]}` : m[2]!;
      const kind = tfKind(block);
      const key = `${kind}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        makeSymbol({
          name,
          kind,
          language: 'terraform',
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
