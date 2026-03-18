// packages/core/src/markdown.ts
import type { SemanticNode, EpisodicNode } from './types.js';

// ─── DiffResult ───────────────────────────────────────────────────────────────

export interface DiffResult {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

// ─── FileEntry / GraphEntry shapes ───────────────────────────────────────────

export interface MarkdownEntry {
  id: string;
  contentHash: string;
}

// ─── renderToMarkdown ─────────────────────────────────────────────────────────

/**
 * Renders a SemanticNode or EpisodicNode to YAML frontmatter + markdown content.
 */
export function renderToMarkdown(node: SemanticNode | EpisodicNode): string {
  const lines: string[] = ['---'];

  if (isSemanticNode(node)) {
    lines.push(`id: ${node.id}`);
    lines.push(`confidence: ${node.confidence}`);
    lines.push(`signal_count: ${node.signal_count}`);
    lines.push(`decay_class: ${node.decay_class}`);

    if (node.tags && node.tags.length > 0) {
      lines.push('tags:');
      for (const tag of node.tags) {
        lines.push(`  - ${tag}`);
      }
    } else {
      lines.push('tags: []');
    }

    lines.push(`created_at: "${node.created_at}"`);
    lines.push(`updated_at: "${node.updated_at}"`);
  } else {
    // EpisodicNode
    lines.push(`id: ${node.id}`);
    lines.push(`session_id: ${node.session_id}`);
    lines.push(`agent_id: ${node.agent_id}`);
    lines.push(`task: ${node.task}`);

    if (node.outcome !== undefined) {
      lines.push(`outcome: ${node.outcome}`);
    }

    if (node.ttl !== undefined) {
      lines.push(`ttl: ${node.ttl}`);
    }

    lines.push(`created_at: "${node.created_at}"`);
  }

  lines.push('---');
  lines.push('');
  lines.push(node.content);

  return lines.join('\n');
}

// ─── parseFromMarkdown ────────────────────────────────────────────────────────

/**
 * Parses YAML frontmatter markdown back to a SemanticNode.
 * Splits on `---`, parses key-value pairs, handles arrays (lines starting with `  - `),
 * parses numbers, strips quotes from string values.
 */
export function parseFromMarkdown(md: string): SemanticNode {
  const parts = md.split('---');
  // parts[0] is empty (before first ---), parts[1] is frontmatter, parts[2+] is body
  const frontmatterBlock = parts[1] ?? '';
  const bodyParts = parts.slice(2);
  const content = bodyParts.join('---').replace(/^\n+/, '').trimEnd();

  const fields: Record<string, unknown> = {};
  const fmLines = frontmatterBlock.split('\n');

  let currentArrayKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of fmLines) {
    if (line.trim() === '') continue;

    // Array item line
    if (line.startsWith('  - ')) {
      if (currentArrayKey !== null) {
        currentArray.push(line.slice(4).trim());
      }
      continue;
    }

    // Flush previous array if we hit a new key
    if (currentArrayKey !== null) {
      fields[currentArrayKey] = currentArray;
      currentArrayKey = null;
      currentArray = [];
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    // Inline empty array
    if (rawValue === '[]') {
      fields[key] = [];
      continue;
    }

    // Start of a block array (value is empty after colon)
    if (rawValue === '') {
      currentArrayKey = key;
      currentArray = [];
      continue;
    }

    fields[key] = parseScalar(rawValue);
  }

  // Flush any trailing array
  if (currentArrayKey !== null) {
    fields[currentArrayKey] = currentArray;
  }

  const id = String(fields['id'] ?? '');
  const confidence = Number(fields['confidence'] ?? 0);
  const signal_count = Number(fields['signal_count'] ?? 0);
  const decay_class = String(fields['decay_class'] ?? 'stable') as SemanticNode['decay_class'];
  const tags = (fields['tags'] as string[]) ?? [];
  const created_at = String(fields['created_at'] ?? '');
  const updated_at = String(fields['updated_at'] ?? '');

  return {
    id,
    content,
    confidence,
    signal_count,
    decay_class,
    tags,
    created_at,
    updated_at,
  };
}

// ─── diffEntries ──────────────────────────────────────────────────────────────

/**
 * Compare file entries vs graph entries by content hash.
 * Returns { added, modified, deleted, unchanged } arrays of IDs.
 *
 * - added:     in fileEntries but not in graphEntries
 * - modified:  in both, but hashes differ
 * - deleted:   in graphEntries but not in fileEntries
 * - unchanged: in both with matching hashes
 */
export function diffEntries(
  fileEntries: MarkdownEntry[],
  graphEntries: MarkdownEntry[],
): DiffResult {
  const fileMap = new Map<string, string>(fileEntries.map((e) => [e.id, e.contentHash]));
  const graphMap = new Map<string, string>(graphEntries.map((e) => [e.id, e.contentHash]));

  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];
  const deleted: string[] = [];

  for (const [id, fileHash] of fileMap) {
    if (!graphMap.has(id)) {
      added.push(id);
    } else if (graphMap.get(id) !== fileHash) {
      modified.push(id);
    } else {
      unchanged.push(id);
    }
  }

  for (const [id] of graphMap) {
    if (!fileMap.has(id)) {
      deleted.push(id);
    }
  }

  return { added, modified, deleted, unchanged };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSemanticNode(node: SemanticNode | EpisodicNode): node is SemanticNode {
  return 'confidence' in node && 'decay_class' in node;
}

/**
 * Parse a scalar YAML value: strips surrounding quotes, or converts to number.
 */
function parseScalar(raw: string): string | number {
  // Quoted string
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  // Numeric
  const num = Number(raw);
  if (!isNaN(num) && raw !== '') {
    return num;
  }

  return raw;
}
