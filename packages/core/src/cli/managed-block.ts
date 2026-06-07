// packages/core/src/cli/managed-block.ts
//
// Owns a fenced region inside an agent's static context file (AGENTS.md,
// .hermes.md, ...). `memberry context materialize` rewrites only the region
// between the markers, leaving the human-authored content around it untouched.
// Pure and unit-tested; no I/O here.

export const BLOCK_BEGIN = '<!-- MEMBERRY:BEGIN (managed by `memberry context materialize` — do not edit by hand) -->';
export const BLOCK_END = '<!-- MEMBERRY:END -->';

// Match the managed region by its marker tags only — tolerant of the inner
// description text, surrounding whitespace, AND the legacy `AMP:` brand, so a
// block written by a pre-rebrand version is found and replaced (not
// duplicated). [\s\S] spans newlines without the `s` flag.
const BLOCK_RE = /<!-- (?:AMP|MEMBERRY):BEGIN\b[\s\S]*?<!-- (?:AMP|MEMBERRY):END -->/;

/** Wrap a rendered body in the begin/end markers. */
export function wrapManagedBlock(body: string): string {
  return `${BLOCK_BEGIN}\n${body.trim()}\n${BLOCK_END}`;
}

/** True if the file already contains a managed block. */
export function hasManagedBlock(fileContent: string): boolean {
  return BLOCK_RE.test(fileContent);
}

/**
 * Replace the managed block in `fileContent` with `body` (rendered, unwrapped).
 * If no block exists, append one at the end of the file. Idempotent: calling
 * twice with the same body yields byte-identical output.
 */
export function replaceManagedBlock(fileContent: string, body: string): string {
  const block = wrapManagedBlock(body);
  if (hasManagedBlock(fileContent)) {
    return fileContent.replace(BLOCK_RE, block);
  }
  const base = fileContent.replace(/\s*$/, '');
  // New file → just the block; existing content → blank line, then the block.
  return base.length === 0 ? `${block}\n` : `${base}\n\n${block}\n`;
}

/** Remove the managed block (and a trailing blank line) if present. */
export function stripManagedBlock(fileContent: string): string {
  if (!hasManagedBlock(fileContent)) return fileContent;
  return fileContent.replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
}
