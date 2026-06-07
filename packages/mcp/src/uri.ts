// packages/mcp/src/uri.ts

export interface AmpUri {
  type: 'entity' | 'tag';
  name: string;
}

/**
 * Parse a MemBerry URI of the form:
 *   memberry://entity/ClientX
 *   memberry://tag/brand-voice
 *
 * The legacy `amp://` scheme is still accepted so existing MWP stage
 * CONTEXT.md files keep resolving after the rebrand.
 *
 * Throws on invalid URIs.
 */
const URI_PREFIXES = ['memberry://', 'amp://'] as const;

export function parseAmpUri(uri: string): AmpUri {
  if (!uri || typeof uri !== 'string') {
    throw new Error(`Invalid MemBerry URI: ${uri}`);
  }

  const prefix = URI_PREFIXES.find((p) => uri.startsWith(p));
  if (!prefix) {
    throw new Error(`Invalid MemBerry URI — must start with "memberry://" (legacy "amp://" also accepted): ${uri}`);
  }

  const rest = uri.slice(prefix.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) {
    throw new Error(`Invalid MemBerry URI — missing type/name separator: ${uri}`);
  }

  const type = rest.slice(0, slashIdx);
  const name = rest.slice(slashIdx + 1);

  if (type !== 'entity' && type !== 'tag') {
    throw new Error(`Invalid MemBerry URI — unknown type "${type}" (must be "entity" or "tag"): ${uri}`);
  }

  if (!name || name.trim() === '') {
    throw new Error(`Invalid MemBerry URI — name is empty: ${uri}`);
  }

  return { type, name };
}

/**
 * Convert a parsed AmpUri to a LoadScope partial (entities / tags params).
 */
export function uriToLoadScope(uri: AmpUri): { entities?: string[]; tags?: string[] } {
  if (uri.type === 'entity') {
    return { entities: [uri.name] };
  }
  return { tags: [uri.name] };
}
