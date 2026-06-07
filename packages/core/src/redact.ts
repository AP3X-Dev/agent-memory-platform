// packages/core/src/redact.ts
//
// Secret redaction applied at the INGEST boundary (berry_store), gated by
// MEMBERRY_REDACT_ON_INGEST. The graph package already redacts at export time,
// but that is the last line of defense — by then the plaintext secret is already
// persisted in Neo4j and leaks via raw DB access / backups. Redacting here keeps
// credentials out of the store entirely.
//
// Kept deliberately in @memberry/core (not imported from @memberry/graph) to
// avoid a dependency cycle. The pattern set is intentionally conservative to
// avoid mangling legitimate prose.

const SECRET_REPLACEMENT = '[REDACTED]';

/** Conservative high-signal secret shapes (no look-behind, broad runtime compat). */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style secret keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /ghp_[A-Za-z0-9]{30,}/g, // GitHub personal access token
  /gho_[A-Za-z0-9]{30,}/g, // GitHub OAuth token
  /github_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained PAT
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack token
  /AIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, // JWT
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, // PEM
];

/**
 * `KEY = "value"` / `secret: value` / `token=value` assignments where the key
 * name signals a credential. Captures the key prefix, redacts the value.
 */
const SECRET_ASSIGNMENT =
  /\b((?:api[_-]?key|secret|token|password|passwd|access[_-]?token|client[_-]?secret|auth)\s*[:=]\s*)(['"]?)[^'"\s,;]+\2/gi;

/**
 * Credentials embedded in connection strings, e.g.
 * `redis://user:p4ss@host`, `postgres://u:p@h`. Redacts the password component.
 */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^:/\s]+:)[^@/\s]+@/gi;

/** Redact common secret shapes from a free-text string. */
export function redactSecrets(value: string): string {
  let out = value;
  for (const re of SECRET_PATTERNS) out = out.replace(re, SECRET_REPLACEMENT);
  out = out.replace(SECRET_ASSIGNMENT, (_m, prefix) => `${prefix}${SECRET_REPLACEMENT}`);
  out = out.replace(URL_CREDENTIALS, (_m, prefix) => `${prefix}${SECRET_REPLACEMENT}@`);
  return out;
}

/** Redact secrets from a value only when it is a string; pass everything else through. */
export function redactValue(value: unknown): unknown {
  return typeof value === 'string' ? redactSecrets(value) : value;
}
