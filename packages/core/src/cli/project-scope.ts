// packages/core/src/cli/project-scope.ts
//
// Resolves the MemBerry project tag for a working directory by reading the
// `## MemBerry Memory` config block from the project's CLAUDE.md (the same block the
// agents already read). Walks up to the git root. Falls back to the directory
// name so a hook still produces a sane scope in an unconfigured repo.

import fs from 'node:fs';
import path from 'node:path';

export interface ProjectScope {
  /** e.g. "project:amp" */
  tag: string;
  /** Entity names listed under the MemBerry Memory config, if any. */
  entities: string[];
  /** Absolute path to the CLAUDE.md the config came from, or null if none. */
  source: string | null;
}

/** Find the nearest CLAUDE.md walking up from `start` (stops at filesystem root). */
function findClaudeMd(start: string): string | null {
  let dir = path.resolve(start);
  // Bound the walk so a stray cwd can't loop forever.
  for (let i = 0; i < 64; i++) {
    const candidate = path.join(dir, 'CLAUDE.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Extract `Project Tag: project:xyz` from the MemBerry Memory section. */
function parseTag(content: string): string | null {
  const m = content.match(/Project Tag:\s*(project:[A-Za-z0-9._-]+)/i);
  return m ? m[1] : null;
}

/** Extract the bullet list under an `Entities:` heading in the MemBerry Memory section. */
function parseEntities(content: string): string[] {
  const idx = content.search(/^Entities:\s*$/im);
  if (idx === -1) return [];
  const after = content.slice(idx).split('\n').slice(1);
  const entities: string[] = [];
  for (const line of after) {
    const m = line.match(/^\s*-\s+(.+?)\s*$/);
    if (m) {
      entities.push(m[1].trim());
      continue;
    }
    // Stop at the first non-bullet, non-blank line (end of the list).
    if (line.trim() !== '') break;
  }
  return entities;
}

/** Kebab-case a directory name into a usable fallback tag suffix. */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

export function resolveProjectScope(cwd: string = process.cwd()): ProjectScope {
  const claudeMd = findClaudeMd(cwd);
  if (claudeMd) {
    try {
      const content = fs.readFileSync(claudeMd, 'utf-8');
      const tag = parseTag(content);
      if (tag) {
        return { tag, entities: parseEntities(content), source: claudeMd };
      }
    } catch {
      // fall through to directory fallback
    }
  }
  return { tag: `project:${slug(path.basename(path.resolve(cwd)))}`, entities: [], source: null };
}
