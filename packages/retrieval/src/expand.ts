// packages/retrieval/src/expand.ts
// Query expansion: phrase synonyms, code synonyms, identifier splitting.
// Ported from Context-Engine scripts/hybrid/expand.py

// ─── Synonym Dictionaries ─────────────────────────────────────────────────────

/** Multi-word phrase synonyms (matched first, longest match wins) */
const PHRASE_SYNONYMS: Record<string, string[]> = {
  'true or false': ['boolean', 'bool'],
  'key value': ['dict', 'map', 'dictionary', 'hashmap', 'record'],
  'linked list': ['list', 'deque', 'queue'],
  'binary tree': ['tree', 'btree', 'bst'],
  'hash table': ['hashmap', 'dict', 'map', 'object'],
  'file system': ['fs', 'filesystem', 'io'],
  'command line': ['cli', 'argv', 'args', 'terminal'],
  'regular expression': ['regex', 'regexp', 'pattern'],
  'environment variable': ['env', 'envvar', 'config'],
  'primary key': ['pk', 'id', 'identifier'],
  'foreign key': ['fk', 'reference', 'relation'],
  'error handling': ['catch', 'try', 'except', 'throw', 'rescue'],
  'unit test': ['test', 'spec', 'jest', 'pytest', 'mocha'],
  'data type': ['type', 'typedef', 'interface', 'schema'],
  'access control': ['auth', 'permission', 'rbac', 'acl'],
  'rate limit': ['throttle', 'ratelimit', 'backoff'],
  'web socket': ['websocket', 'ws', 'socket', 'realtime'],
  'api endpoint': ['route', 'handler', 'controller', 'endpoint'],
  'database query': ['sql', 'query', 'orm', 'select'],
  'log message': ['log', 'logger', 'logging', 'debug', 'trace'],
  'configuration file': ['config', 'settings', 'env', 'yaml', 'toml'],
};

/** Single-word code synonyms (100+ cross-language mappings) */
const CODE_SYNONYMS: Record<string, string[]> = {
  // Definitions
  function: ['method', 'def', 'fn', 'func', 'proc', 'sub', 'lambda', 'handler'],
  class: ['type', 'struct', 'object', 'interface', 'trait', 'model'],
  variable: ['var', 'let', 'const', 'val', 'field', 'property', 'prop', 'attr'],
  constant: ['const', 'final', 'static', 'immutable', 'frozen'],
  module: ['package', 'namespace', 'crate', 'mod', 'lib'],
  import: ['require', 'include', 'use', 'from', 'load'],
  export: ['public', 'expose', 'emit', 'provide'],

  // Operations
  create: ['init', 'initialize', 'construct', 'new', 'make', 'build', 'generate', 'spawn'],
  delete: ['remove', 'destroy', 'drop', 'dispose', 'close', 'cleanup', 'teardown'],
  update: ['modify', 'set', 'patch', 'change', 'mutate', 'edit', 'write'],
  read: ['get', 'fetch', 'load', 'find', 'query', 'retrieve', 'lookup', 'select'],
  send: ['emit', 'dispatch', 'publish', 'push', 'post', 'write', 'broadcast'],
  receive: ['listen', 'subscribe', 'consume', 'on', 'handle', 'accept'],
  validate: ['check', 'verify', 'assert', 'ensure', 'sanitize', 'guard'],
  transform: ['map', 'convert', 'parse', 'serialize', 'format', 'encode', 'decode'],
  filter: ['where', 'select', 'find', 'search', 'match', 'grep', 'query'],
  sort: ['order', 'rank', 'arrange', 'compare'],
  iterate: ['loop', 'foreach', 'map', 'reduce', 'walk', 'traverse', 'scan'],

  // Architecture
  middleware: ['interceptor', 'filter', 'pipe', 'hook', 'plugin'],
  controller: ['handler', 'route', 'endpoint', 'action', 'resolver'],
  service: ['provider', 'manager', 'helper', 'util', 'facade'],
  repository: ['store', 'dao', 'model', 'adapter', 'gateway'],
  factory: ['builder', 'creator', 'maker', 'provider'],
  observer: ['listener', 'subscriber', 'watcher', 'handler'],
  config: ['settings', 'options', 'preferences', 'env', 'params'],
  cache: ['memo', 'store', 'buffer', 'pool'],
  queue: ['buffer', 'stream', 'pipe', 'channel', 'bus'],

  // Error handling
  error: ['exception', 'fault', 'failure', 'problem', 'issue', 'bug'],
  throw: ['raise', 'panic', 'abort', 'reject'],
  catch: ['rescue', 'except', 'handle', 'recover', 'trap'],
  retry: ['backoff', 'attempt', 'repeat', 'loop'],
  timeout: ['deadline', 'ttl', 'expire', 'limit'],

  // Auth
  authenticate: ['login', 'signin', 'auth', 'verify', 'identify'],
  authorize: ['permission', 'access', 'allow', 'grant', 'role', 'rbac'],
  token: ['jwt', 'session', 'cookie', 'bearer', 'credential'],

  // Data
  database: ['db', 'store', 'persistence', 'storage'],
  table: ['collection', 'model', 'entity', 'relation', 'schema'],
  record: ['row', 'document', 'entry', 'item', 'tuple'],
  field: ['column', 'attribute', 'property', 'key'],
  index: ['key', 'lookup', 'search', 'hash'],

  // Testing
  test: ['spec', 'it', 'describe', 'expect', 'assert', 'should', 'verify'],
  mock: ['stub', 'fake', 'spy', 'double', 'fixture'],
  setup: ['before', 'beforeEach', 'init', 'fixture', 'arrange'],
  teardown: ['after', 'afterEach', 'cleanup', 'dispose'],

  // Async
  async: ['await', 'promise', 'future', 'task', 'coroutine'],
  callback: ['handler', 'hook', 'listener', 'then', 'resolve'],
  parallel: ['concurrent', 'multithread', 'worker', 'pool'],
};

/** Test-specific injection terms */
const TEST_INJECT_TERMS = ['test_', 'spec', 'describe', 'it(', 'expect(', 'assert', 'pytest', 'jest'];

/** Config-specific injection terms */
const CONFIG_INJECT_TERMS = ['config', 'settings', 'env', 'yaml', 'toml', 'json', 'dotenv'];

// ─── Types ───────────────────────────────────────────────────────────────────

import type { QueryIntent } from './intent.js';
export type { QueryIntent };

export interface ExpandedQuery {
  original: string;
  expanded: string[];
  tokens: string[];
}

// ─── Expansion Functions ─────────────────────────────────────────────────────

/**
 * Split an identifier on camelCase, snake_case, and non-alphanumeric boundaries.
 */
function splitIdent(s: string): string[] {
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const part of parts) {
    const splits = part.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g);
    if (splits) {
      for (const t of splits) {
        const lower = t.toLowerCase();
        if (lower.length > 1) tokens.push(lower);
      }
    }
  }
  return tokens;
}

/**
 * Expand a query with phrase synonyms, code synonyms, and token splitting.
 * Intent-aware: different expansion strategies per query type.
 */
export function expandQuery(query: string, intent?: QueryIntent): ExpandedQuery {
  const original = query;

  // No expansion for identifier lookups
  if (intent === 'IDENTIFIER') {
    return { original, expanded: [original], tokens: splitIdent(query) };
  }

  // Minimal expansion for graph queries (just split identifiers)
  if (intent === 'GRAPH') {
    const tokens = splitIdent(query);
    return { original, expanded: [original], tokens };
  }

  const expanded = new Set<string>();
  expanded.add(original);

  let working = query.toLowerCase();

  // Step 1: Phrase synonym substitution (longest match first)
  const sortedPhrases = Object.keys(PHRASE_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const phrase of sortedPhrases) {
    if (working.includes(phrase)) {
      for (const syn of PHRASE_SYNONYMS[phrase]) {
        expanded.add(working.replace(phrase, syn));
      }
    }
  }

  // Step 2: Token splitting
  const tokens = splitIdent(query);

  // Step 3: Word-level synonym expansion
  for (const token of tokens) {
    const synonyms = CODE_SYNONYMS[token];
    if (synonyms) {
      for (const syn of synonyms.slice(0, 3)) { // Top 3 synonyms per token
        // Replace token in original query
        const variant = working.replace(new RegExp(`\\b${token}\\b`, 'gi'), syn);
        if (variant !== working) expanded.add(variant);
      }
    }
  }

  // Step 4: Intent-specific injection
  if (intent === 'SEMANTIC') {
    // Inject test terms if query mentions testing
    const lower = query.toLowerCase();
    if (lower.includes('test') || lower.includes('spec')) {
      for (const term of TEST_INJECT_TERMS) {
        tokens.push(term);
      }
    }
    if (lower.includes('config') || lower.includes('setting')) {
      for (const term of CONFIG_INJECT_TERMS) {
        tokens.push(term);
      }
    }
  }

  // Cap at 12 expanded queries to avoid search explosion
  const result = [...expanded].slice(0, 12);

  return { original, expanded: result, tokens: [...new Set(tokens)] };
}
