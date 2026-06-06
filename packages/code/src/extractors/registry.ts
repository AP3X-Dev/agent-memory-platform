// Registry routing non-tree-sitter languages to their structural extractor.
import type { ParsedFile, SupportedLanguage } from '../types.js';
import type { StructuralExtractor } from './types.js';
import { sqlExtractor } from './sql.js';
import { terraformExtractor } from './terraform.js';
import { mcpConfigExtractor } from './mcp-config.js';

const EXTRACTORS = new Map<SupportedLanguage, StructuralExtractor>([
  ['sql', sqlExtractor],
  ['terraform', terraformExtractor],
  ['mcp-config', mcpConfigExtractor],
]);

export function isExtractorLanguage(language: SupportedLanguage): boolean {
  return EXTRACTORS.has(language);
}

export function extractStructured(
  filePath: string,
  language: SupportedLanguage,
  source: string,
  now: string,
): ParsedFile {
  const extractor = EXTRACTORS.get(language);
  return {
    file_path: filePath,
    language,
    symbols: extractor ? extractor.extract(filePath, source, now) : [],
    relations: [],
    imports: [],
  };
}
