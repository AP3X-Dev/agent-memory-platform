// packages/mcp/src/uri.ts

export interface AmpUri {
  type: 'entity' | 'tag';
  name: string;
}

/**
 * Parse an AMP URI of the form:
 *   amp://entity/ClientX
 *   amp://tag/brand-voice
 *
 * Throws on invalid URIs.
 */
export function parseAmpUri(uri: string): AmpUri {
  if (!uri || typeof uri !== 'string') {
    throw new Error(`Invalid AMP URI: ${uri}`);
  }

  const AMP_PREFIX = 'amp://';
  if (!uri.startsWith(AMP_PREFIX)) {
    throw new Error(`Invalid AMP URI — must start with "amp://": ${uri}`);
  }

  const rest = uri.slice(AMP_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) {
    throw new Error(`Invalid AMP URI — missing type/name separator: ${uri}`);
  }

  const type = rest.slice(0, slashIdx);
  const name = rest.slice(slashIdx + 1);

  if (type !== 'entity' && type !== 'tag') {
    throw new Error(`Invalid AMP URI — unknown type "${type}" (must be "entity" or "tag"): ${uri}`);
  }

  if (!name || name.trim() === '') {
    throw new Error(`Invalid AMP URI — name is empty: ${uri}`);
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
