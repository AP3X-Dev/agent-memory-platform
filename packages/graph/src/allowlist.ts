/**
 * Secret-safety boundary (Critical Issue #5 / Correction C-04).
 *
 * `AmpGraphNode.properties` is serialized by every downstream consumer (report,
 * JSON/HTML/GraphML export). A labels-only rule is insufficient because the real
 * leak surface is the per-node property map:
 *   - `Symbol.signature` / `Symbol.doc_comment` — a `const API_KEY = "sk-..."`
 *     lands verbatim in `signature`.
 *   - `Semantic.content` — free prose incl. verbatim braindump text.
 *   - embedding / lexical_vector / mini_vector / sparse_* — leakage + bloat.
 *   - absolute `Source.path` — filesystem structure.
 *
 * Defense is a per-node-type property ALLOWLIST (not a denylist) applied here at
 * the snapshot builder, plus a secret-pattern redaction pass over every string
 * that survives. Report/export inherit it because they consume the snapshot.
 */
import { isNeo4jInt } from './coerce.js';
import type { AmpGraphNodeType } from './types.js';

/**
 * Explicit per-node-type property allowlist. Only these keys are emitted into
 * `node.properties`. Everything else — full `signature`/`doc_comment` bodies,
 * `Semantic.content`, every vector field, absolute `Source.path`, episodic
 * lineage — is dropped at the boundary by default.
 *
 * `file_path` (Symbol) / `path` (Component) are intentionally NOT here: they are
 * surfaced via `node.source_file` for PR impact, redacted, never as bulk props.
 */
export const PROPERTY_ALLOWLIST: Record<AmpGraphNodeType, readonly string[]> = {
  entity: ['name', 'type', 'domain', 'auto_created', 'created_at', 'updated_at'],
  component: ['name', 'type', 'domain', 'created_at', 'updated_at'],
  symbol: [
    'name',
    'kind',
    'language',
    'start_line',
    'end_line',
    'content_hash',
    'parent_symbol',
    'created_at',
    'updated_at',
  ],
  semantic: [
    'confidence',
    'signal_count',
    'decay_class',
    'status',
    'scope',
    'tags',
    'created_at',
    'updated_at',
  ],
  episodic: ['session_id', 'agent_id', 'outcome', 'scope', 'tags', 'created_at'],
  fact: [
    'subject',
    'predicate',
    'object',
    'entity_id',
    'valid_at',
    'invalid_at',
    'confidence',
    'status',
    'scope',
    'tags',
    'created_at',
    'updated_at',
  ],
  source: ['title', 'source_type', 'project_tag', 'created_at'],
  aspect: ['name', 'stability_tier', 'implies', 'anchors', 'created_at', 'updated_at'],
  community: ['label', 'community_id', 'cohesion', 'node_count', 'edge_count', 'created_at'],
  unknown: ['name', 'type', 'created_at'],
};

/**
 * Keys that must NEVER appear in any serialized output, regardless of allowlist.
 * A second backstop for edge properties (which have no per-type allowlist) and
 * for any future node type whose allowlist is misconfigured.
 */
const FORBIDDEN_KEYS = new Set<string>([
  'signature',
  'doc_comment',
  'content',
  'embedding',
  'lexical_vector',
  'mini_vector',
  'sparse_indices',
  'sparse_values',
  'vector',
  'source_episode_ids',
]);

const SECRET_REPLACEMENT = '[REDACTED]';

/**
 * Conservative secret-pattern matchers, applied to every surviving free-text
 * string (labels, allowlisted string properties, source_file). Intentionally
 * avoids look-behind for broad runtime compatibility.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style secret keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /ghp_[A-Za-z0-9]{30,}/g, // GitHub personal access token
  /gho_[A-Za-z0-9]{30,}/g, // GitHub OAuth token
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack token
  /AIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, // JWT
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, // PEM
];

/**
 * Matches `KEY = "value"` / `secret: value` / `token=value` assignments where
 * the key name signals a credential. Captures the key prefix, redacts the value.
 */
const SECRET_ASSIGNMENT =
  /\b((?:api[_-]?key|secret|token|password|passwd|access[_-]?token|client[_-]?secret|auth)\s*[:=]\s*)(['"]?)[^'"\s,;]+\2/gi;

/** Redact common secret shapes from a free-text string. */
export function redactSecrets(value: string): string {
  let out = value;
  for (const re of SECRET_PATTERNS) out = out.replace(re, SECRET_REPLACEMENT);
  out = out.replace(SECRET_ASSIGNMENT, (_m, prefix) => `${prefix}${SECRET_REPLACEMENT}`);
  return out;
}

/** Redact secrets from an arbitrary value if (and only if) it is a string. */
export function redactValue(value: unknown): unknown {
  return typeof value === 'string' ? redactSecrets(value) : value;
}

/** True for an array that looks like an embedding/vector (all numbers). */
function isNumericVector(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'number' || isNeo4jInt(v))
  );
}

/** Coerce a single allowlisted value: ints → number, strings → redacted. */
function sanitizeValue(value: unknown): unknown {
  if (isNeo4jInt(value)) return value.toNumber();
  if (typeof value === 'string') return redactSecrets(value);
  if (Array.isArray(value)) {
    return value.map((v) => (isNeo4jInt(v) ? v.toNumber() : redactValue(v)));
  }
  return value;
}

/**
 * Apply the per-node-type allowlist to a raw Neo4j property map: keep only
 * allowlisted keys, coerce neo4j integers, redact secret patterns from strings,
 * and drop anything that looks like a vector or a forbidden bulk field.
 */
export function applyAllowlist(
  type: AmpGraphNodeType,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = PROPERTY_ALLOWLIST[type] ?? PROPERTY_ALLOWLIST.unknown;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in raw)) continue;
    if (FORBIDDEN_KEYS.has(key)) continue;
    const value = raw[key];
    if (isNumericVector(value)) continue; // never emit vectors
    out[key] = sanitizeValue(value);
  }
  return out;
}

/**
 * Sanitize an arbitrary relationship property map (no per-type allowlist exists
 * for edges): drop forbidden/vector fields, coerce ints, redact strings.
 */
export function sanitizeEdgeProps(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (isNumericVector(value)) continue;
    out[key] = sanitizeValue(value);
  }
  return out;
}
