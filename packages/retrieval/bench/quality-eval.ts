#!/usr/bin/env tsx
// packages/retrieval/bench/quality-eval.ts
//
// RETRIEVAL QUALITY evaluation (distinct from benchmark.ts, which measures latency).
// Measures how WELL the ranking pipeline retrieves relevant memories — the property
// that actually determines whether the memory layer is "effective".
//
// It wires the REAL production ranking path (expandQuery → adaptiveWeights →
// rrfFusion + lexicalTextScore boost → MMR, exactly as UnifiedAssembler.assembleRanked
// composes them) over a human-labeled golden set, and reports Recall@k, Precision@k,
// MRR, and nDCG@k. It also reports single-channel baselines so fusion lift is visible.
//
// The two input channels stand in for what the DB layer produces at query time:
//   - lexical  : BM25-lite over doc tokens vs the query's expanded tokens (faithful to
//                the token path the code/fulltext search feeds into fusion).
//   - dense    : synonym-normalized concept-vector cosine — a deterministic, offline
//                proxy for embedding similarity. It is NOT tuned to flatter fusion;
//                gold labels are judged purely on human relevance.
//
// Both channels are deliberately imperfect and complementary, so fusion has real work
// to do — mirroring production, where neither dense nor lexical alone is sufficient.
//
// Run: npx tsx packages/retrieval/bench/quality-eval.ts
//      npx tsx packages/retrieval/bench/quality-eval.ts --verbose   (per-query diagnostics)

import {
  rrfFusion,
  expandQuery,
  lexicalTextScore,
  computeQueryStats,
  adaptiveWeights,
  inferSourceTypeBoost,
  classifyIntent,
} from '../src/index.js';
import type { RetrievalResult, SourceType, BoostFactors } from '../src/types.js';
import type { QueryIntent } from '../src/intent.js';

// ─── Golden corpus ─────────────────────────────────────────────────────────────
// Realistic agent-memory documents spanning all source types. Content is written so
// that relevance is human-judgeable independent of either retrieval channel.

interface CorpusDoc {
  id: string;
  source_type: SourceType;
  title: string;
  content: string;
  file_path?: string;
  confidence?: number;
  source_episode_ids?: string[];
  invalidated_at?: string;
}

const CORPUS: CorpusDoc[] = [
  // ─ Auth knowledge & code ─
  { id: 'sym-validateToken', source_type: 'symbol', title: 'validateToken (function)',
    content: 'validateToken(token: string): boolean — verifies a JWT bearer token, checks expiry and signature against the auth secret.',
    file_path: 'src/auth/token.ts' },
  { id: 'sym-AuthService', source_type: 'symbol', title: 'AuthService (class)',
    content: 'AuthService class — handles login, logout, session creation and token refresh. Depends on UserRepository and TokenStore.',
    file_path: 'src/auth/service.ts' },
  { id: 'sem-auth-jwt', source_type: 'semantic', title: 'Auth uses JWT bearer tokens',
    content: 'Authentication is handled with JWT bearer tokens. Login issues a signed token; every request validates the token signature and expiry before authorizing access.',
    confidence: 0.9, source_episode_ids: ['ep-1', 'ep-2'] },
  { id: 'sem-auth-refresh', source_type: 'semantic', title: 'Token refresh rotates the session',
    content: 'When a JWT nears expiry the refresh flow rotates the session token and invalidates the old credential, keeping the user logged in without re-authentication.',
    confidence: 0.7, source_episode_ids: ['ep-3'] },
  { id: 'arch-auth-module', source_type: 'arch_entity', title: 'Auth module',
    content: 'Auth module — responsibility: identity and access control. Interface: login, authorize, validate. Used by the API gateway and the payment service.' },
  { id: 'ep-auth-bug', source_type: 'episodic', title: 'Fixed auth token expiry off-by-one',
    content: 'Bug: tokens expired one minute early because expiry comparison used seconds vs milliseconds. Root cause in validateToken. Fixed by normalizing units.' },

  // ─ Payment flow ─
  { id: 'sym-processPayment', source_type: 'symbol', title: 'processPayment (function)',
    content: 'processPayment(order: Order): Receipt — charges the customer, handles retries with exponential backoff, and emits a payment event on success.',
    file_path: 'src/payment/process.ts' },
  { id: 'sem-payment-retry', source_type: 'semantic', title: 'Payment retries use exponential backoff',
    content: 'The payment flow retries failed charges with exponential backoff and a jittered delay. After three failed attempts the order is marked failed and an error is surfaced to the user.',
    confidence: 0.8, source_episode_ids: ['ep-4', 'ep-5'] },
  { id: 'sem-payment-errors', source_type: 'semantic', title: 'Payment error handling',
    content: 'Errors in the payment flow are caught, logged with a correlation id, and converted into a typed failure. Network exceptions trigger a retry; validation faults abort immediately.',
    confidence: 0.75 },
  { id: 'arch-payment-service', source_type: 'arch_entity', title: 'Payment service',
    content: 'Payment service — responsibility: charge customers and reconcile orders. Depends on the auth module for authorization and the queue for async settlement.' },

  // ─ Rate limiting / config ─
  { id: 'sem-rate-limit', source_type: 'semantic', title: 'Rate limiting via token bucket',
    content: 'API rate limiting uses a token-bucket throttle keyed by client id. Limits are configured per route in the gateway settings and enforced by middleware.',
    confidence: 0.85, source_episode_ids: ['ep-6'] },
  { id: 'sym-rateLimitMiddleware', source_type: 'symbol', title: 'rateLimitMiddleware (function)',
    content: 'rateLimitMiddleware(req, res, next) — applies the throttle, reads limits from config, and rejects with 429 when the bucket is empty.',
    file_path: 'src/middleware/rateLimit.ts' },
  { id: 'sem-config-env', source_type: 'semantic', title: 'Configuration loaded from env',
    content: 'Configuration and settings are loaded from environment variables with a typed schema. Rate limits, timeouts, and feature flags all live in the config layer.',
    confidence: 0.6 },

  // ─ Retrieval / ranking internals (self-referential, exercises identifier queries) ─
  { id: 'sym-rrfFusion', source_type: 'symbol', title: 'rrfFusion (function)',
    content: 'rrfFusion(lists, limit, k, boosts, collectionSize, postBoost) — reciprocal rank fusion merging multiple ranked lists, then provenance boost, normalization, and MMR diversification.',
    file_path: 'packages/retrieval/src/fusion.ts' },
  { id: 'sem-rrf-why', source_type: 'semantic', title: 'Why RRF for fusion',
    content: 'We fuse hybrid search channels with reciprocal rank fusion because it combines rankings without needing comparable score scales. Rank position, not raw score, drives the blend, which makes dense and lexical results composable.',
    confidence: 0.9, source_episode_ids: ['ep-7', 'ep-8'] },
  { id: 'sym-mmrDiversify', source_type: 'symbol', title: 'mmrDiversify (function)',
    content: 'mmrDiversify(ranked, k, lambda) — maximal marginal relevance, trades relevance against diversity to reduce near-duplicate results from the same file or symbol.',
    file_path: 'packages/retrieval/src/scoring.ts' },

  // ─ Consolidation / memory model ─
  { id: 'sem-consolidation', source_type: 'semantic', title: 'Consolidation promotes episodic to semantic',
    content: 'Consolidation clusters episodic memories by signal weight and promotes recurring patterns into semantic knowledge with a confidence score. Contradiction signals lower confidence and can invalidate facts.',
    confidence: 0.85, source_episode_ids: ['ep-9'] },
  { id: 'sem-temporal-decay', source_type: 'semantic', title: 'Temporal decay of confidence',
    content: 'Confidence decays exponentially with time since the last reinforcing signal. Half-lives differ by volatility class: volatile facts decay fast, permanent facts slowly.',
    confidence: 0.8 },
  { id: 'sem-entity-resolution', source_type: 'semantic', title: 'Entity resolution prevents fragmentation',
    content: 'The entity resolver canonicalizes references by exact match, then case-insensitive, then alias, so "MemBerry" and "Agent Memory Protocol" map to one entity and knowledge does not fragment.',
    confidence: 0.7 },

  // ─ Distractors / outdated (should rank low; one invalidated) ─
  { id: 'sem-old-auth', source_type: 'semantic', title: 'Auth previously used session cookies',
    content: 'Authentication used to rely on server-side session cookies stored in Redis. This approach was replaced and is no longer current.',
    confidence: 0.5, invalidated_at: '2025-01-01' },
  { id: 'sym-formatDate', source_type: 'symbol', title: 'formatDate (function)',
    content: 'formatDate(d: Date): string — formats a date as ISO 8601 for logging and display.',
    file_path: 'src/utils/date.ts' },
  { id: 'sym-Logger', source_type: 'symbol', title: 'Logger (class)',
    content: 'Logger class — structured logging with levels, correlation ids, and JSON output. Used across services.',
    file_path: 'src/utils/logger.ts' },
  { id: 'sem-testing', source_type: 'semantic', title: 'Testing strategy uses vitest',
    content: 'The testing strategy is unit tests with vitest plus regression specs. Each package owns its tests; mocks stub external services.',
    confidence: 0.7 },

  // ─ Conflict/update pairs: a CURRENT fact and a SUPERSEDED one on the same topic.
  //   An effective agent memory must surface the current truth and demote the stale one
  //   (MemoryAgentBench "conflict resolution" / LongMemEval "knowledge update"). ─
  { id: 'sem-testing-jest-old', source_type: 'semantic', title: 'Project previously used Jest',
    content: 'The project used Jest as its test runner. It was migrated to Vitest; Jest is no longer used.',
    confidence: 0.5, invalidated_at: '2025-02-01' },
  { id: 'sem-deploy-pnpm', source_type: 'semantic', title: 'Deploys run via pnpm deploy',
    content: 'Deployment to the production cluster runs through the pnpm deploy pipeline with systemd rolling restarts.',
    confidence: 0.85, source_episode_ids: ['ep-d1'] },
  { id: 'sem-deploy-npm-old', source_type: 'semantic', title: 'Deploys previously used npm run ship',
    content: 'Deployment used to run via npm run ship. That script was replaced and is no longer the deploy path.',
    confidence: 0.5, invalidated_at: '2025-03-01' },

  // ─ Same-file cluster (src/payment/charge.ts): multiple sibling symbols that are ALL
  //   relevant to a "payment charge functions" query. Exercises MMR's same-file penalty:
  //   a hard 1.0 similarity evicts legitimate siblings. ─
  { id: 'sym-chargeCard', source_type: 'symbol', title: 'chargeCard (function)',
    content: 'chargeCard(card: Card, amount: number): ChargeResult — authorizes and captures a payment charge against a card.',
    file_path: 'src/payment/charge.ts' },
  { id: 'sym-authorizeCharge', source_type: 'symbol', title: 'authorizeCharge (function)',
    content: 'authorizeCharge(card: Card, amount: number): AuthHold — places an authorization hold for a payment charge without capturing funds.',
    file_path: 'src/payment/charge.ts' },
  { id: 'sym-captureCharge', source_type: 'symbol', title: 'captureCharge (function)',
    content: 'captureCharge(hold: AuthHold): ChargeResult — captures funds for a previously authorized payment charge.',
    file_path: 'src/payment/charge.ts' },
  { id: 'sym-voidCharge', source_type: 'symbol', title: 'voidCharge (function)',
    content: 'voidCharge(hold: AuthHold): void — voids an authorized payment charge before capture, releasing the hold.',
    file_path: 'src/payment/charge.ts' },

  // ─ Additional distractors to de-saturate Recall@10 (top-10 of ~37 must be selective) ─
  { id: 'sym-parseArgs', source_type: 'symbol', title: 'parseArgs (function)',
    content: 'parseArgs(argv: string[]): Options — parses command-line arguments into a typed options object.',
    file_path: 'src/cli/args.ts' },
  { id: 'sym-loadConfig', source_type: 'symbol', title: 'loadConfig (function)',
    content: 'loadConfig(path: string): Config — reads and validates a configuration file from disk.',
    file_path: 'src/config/load.ts' },
  { id: 'sym-hashPassword', source_type: 'symbol', title: 'hashPassword (function)',
    content: 'hashPassword(plain: string): string — hashes a password with a salted one-way function for storage.',
    file_path: 'src/auth/password.ts' },
  { id: 'sym-EventBus', source_type: 'symbol', title: 'EventBus (class)',
    content: 'EventBus class — in-memory publish/subscribe event bus with typed channels and backpressure.',
    file_path: 'src/events/bus.ts' },
  { id: 'sym-WebSocketClient', source_type: 'symbol', title: 'WebSocketClient (class)',
    content: 'WebSocketClient class — manages a realtime websocket connection with reconnect and heartbeat.',
    file_path: 'src/realtime/ws.ts' },
  { id: 'sem-deployment', source_type: 'semantic', title: 'Deployment via systemd units',
    content: 'Services deploy as systemd units with health checks. Rolling restarts keep the API available during releases.',
    confidence: 0.7 },
  { id: 'sym-MigrationRunner', source_type: 'symbol', title: 'MigrationRunner (class)',
    content: 'MigrationRunner class — applies ordered database migrations and records applied versions.',
    file_path: 'src/db/migrate.ts' },
  { id: 'sym-serializeJson', source_type: 'symbol', title: 'serializeJson (function)',
    content: 'serializeJson(value: unknown): string — stable JSON serialization with sorted keys.',
    file_path: 'src/utils/json.ts' },
  { id: 'sym-CircuitBreaker', source_type: 'symbol', title: 'CircuitBreaker (class)',
    content: 'CircuitBreaker class — trips open after repeated failures and half-opens to probe recovery.',
    file_path: 'src/resilience/breaker.ts' },
  { id: 'arch-notification-service', source_type: 'arch_entity', title: 'Notification service',
    content: 'Notification service — responsibility: deliver emails and push notifications. Listens to events on the queue.' },
  { id: 'sym-renderTemplate', source_type: 'symbol', title: 'renderTemplate (function)',
    content: 'renderTemplate(name: string, data: object): string — renders an HTML template with interpolated data.',
    file_path: 'src/view/template.ts' },
];

// ─── Golden queries ──────────────────────────────────────────────────────────
// `relevant` is the human-judged set of doc ids that genuinely answer the query.

interface GoldQuery {
  query: string;
  expectedIntent: QueryIntent;
  relevant: string[];
}

const QUERIES: GoldQuery[] = [
  // Identifier lookups — exact symbol should dominate.
  { query: 'validateToken', expectedIntent: 'IDENTIFIER', relevant: ['sym-validateToken'] },
  { query: 'rrfFusion', expectedIntent: 'IDENTIFIER', relevant: ['sym-rrfFusion'] },
  { query: 'AuthService', expectedIntent: 'IDENTIFIER', relevant: ['sym-AuthService'] },

  // Semantic / narrative — knowledge docs should win, synonyms matter.
  { query: 'how does authentication work', expectedIntent: 'SEMANTIC',
    relevant: ['sem-auth-jwt', 'sym-AuthService', 'arch-auth-module', 'sym-validateToken'] },
  { query: 'why do we use RRF for fusion', expectedIntent: 'SEMANTIC',
    relevant: ['sem-rrf-why', 'sym-rrfFusion'] },
  { query: 'explain the consolidation strategy', expectedIntent: 'SEMANTIC',
    relevant: ['sem-consolidation', 'sem-temporal-decay'] },
  { query: 'how are payment failures retried', expectedIntent: 'SEMANTIC',
    relevant: ['sem-payment-retry', 'sym-processPayment', 'sem-payment-errors'] },

  // Hybrid — mix of concept + identifier.
  { query: 'error handling in the payment flow', expectedIntent: 'HYBRID',
    relevant: ['sem-payment-errors', 'sem-payment-retry', 'sym-processPayment'] },
  { query: 'rate limiting configuration', expectedIntent: 'HYBRID',
    relevant: ['sem-rate-limit', 'sym-rateLimitMiddleware', 'sem-config-env'] },
  { query: 'token refresh and expiry', expectedIntent: 'HYBRID',
    relevant: ['sem-auth-refresh', 'sym-validateToken', 'ep-auth-bug'] },
  { query: 'how does entity resolution avoid fragmentation', expectedIntent: 'SEMANTIC',
    relevant: ['sem-entity-resolution'] },

  // Same-file cluster — all four sibling charge functions are relevant. MMR's same-file
  // penalty must not evict legitimate siblings.
  { query: 'payment charge functions', expectedIntent: 'HYBRID',
    relevant: ['sym-chargeCard', 'sym-authorizeCharge', 'sym-captureCharge', 'sym-voidCharge'] },
];

// ─── Conflict / knowledge-update queries ─────────────────────────────────────
// Each pairs a query with the CURRENT answer and the SUPERSEDED one. The memory layer
// must rank current above stale and keep stale out of the top of the context window.

interface ConflictQuery {
  query: string;
  current: string; // doc id that reflects present truth
  stale: string;   // doc id that is invalidated/superseded
}

const CONFLICT_QUERIES: ConflictQuery[] = [
  { query: 'what test runner does the project use', current: 'sem-testing', stale: 'sem-testing-jest-old' },
  { query: 'how do we deploy to production', current: 'sem-deploy-pnpm', stale: 'sem-deploy-npm-old' },
  { query: 'how does authentication work', current: 'sem-auth-jwt', stale: 'sem-old-auth' },
];

// ─── Tokenization (shared) ───────────────────────────────────────────────────
// Reuse expandQuery's identifier splitting for a consistent tokenizer across docs
// and queries (no intent → pure splitIdent, no synonym injection).

function tokenize(text: string): string[] {
  return expandQuery(text).tokens;
}

// ─── Lexical channel: BM25-lite ──────────────────────────────────────────────

const K1 = 1.2;
const B = 0.75;

interface LexicalIndex {
  docTokens: Map<string, string[]>;
  df: Map<string, number>;
  avgLen: number;
  n: number;
}

function buildLexicalIndex(): LexicalIndex {
  const docTokens = new Map<string, string[]>();
  const df = new Map<string, number>();
  let totalLen = 0;
  for (const doc of CORPUS) {
    const toks = tokenize(`${doc.title} ${doc.content} ${doc.file_path ?? ''}`);
    docTokens.set(doc.id, toks);
    totalLen += toks.length;
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { docTokens, df, avgLen: totalLen / CORPUS.length, n: CORPUS.length };
}

function bm25Channel(queryTokens: string[], idx: LexicalIndex, topN: number): RetrievalResult[] {
  const scored: Array<{ doc: CorpusDoc; score: number }> = [];
  for (const doc of CORPUS) {
    const toks = idx.docTokens.get(doc.id)!;
    const len = toks.length;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const qt of new Set(queryTokens)) {
      const f = tf.get(qt);
      if (!f) continue;
      const df = idx.df.get(qt) ?? 0;
      const idf = Math.log(1 + (idx.n - df + 0.5) / (df + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / idx.avgLen))));
    }
    if (score > 0) scored.push({ doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => toResult(s.doc, s.score));
}

// ─── Dense channel: synonym-normalized concept vectors (embedding proxy) ─────
// Map tokens to canonical concepts via the same code-synonym families the expander
// uses, so "auth"/"login"/"authenticate" collapse to one concept. Cosine over concept
// frequency vectors rewards semantic overlap that exact-token matching misses.

const CONCEPT_FAMILIES: string[][] = [
  ['authenticate', 'login', 'signin', 'auth', 'verify', 'identify', 'authentication'],
  ['authorize', 'permission', 'access', 'allow', 'grant', 'role', 'rbac'],
  ['token', 'jwt', 'session', 'cookie', 'bearer', 'credential'],
  ['error', 'exception', 'fault', 'failure', 'problem', 'issue', 'bug'],
  ['retry', 'backoff', 'attempt', 'repeat'],
  ['rate', 'throttle', 'ratelimit', 'limit', 'bucket'],
  ['config', 'settings', 'options', 'env', 'environment', 'configuration'],
  ['fusion', 'fuse', 'blend', 'merge', 'rrf', 'reciprocal'],
  ['rank', 'ranking', 'rerank', 'order', 'score', 'relevance'],
  ['consolidate', 'consolidation', 'promote', 'cluster', 'distill'],
  ['decay', 'temporal', 'expiry', 'expire', 'halflife', 'volatility'],
  ['entity', 'resolution', 'resolver', 'canonical', 'alias', 'fragmentation'],
  ['payment', 'charge', 'pay', 'billing', 'settlement'],
  ['diversity', 'diversify', 'mmr', 'marginal', 'redundancy'],
  ['refresh', 'rotate', 'renew'],
];

function buildConceptMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const fam of CONCEPT_FAMILIES) {
    const canonical = fam[0];
    for (const w of fam) map.set(w, canonical);
  }
  return map;
}

const CONCEPT_MAP = buildConceptMap();

function conceptVector(tokens: string[]): Map<string, number> {
  const vec = new Map<string, number>();
  for (const t of tokens) {
    const c = CONCEPT_MAP.get(t) ?? t;
    vec.set(c, (vec.get(c) ?? 0) + 1);
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0);
  if (dot === 0) return 0;
  let na = 0;
  for (const v of a.values()) na += v * v;
  let nb = 0;
  for (const v of b.values()) nb += v * v;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function denseChannel(queryTokens: string[], topN: number): RetrievalResult[] {
  const qVec = conceptVector(queryTokens);
  const scored: Array<{ doc: CorpusDoc; score: number }> = [];
  for (const doc of CORPUS) {
    const dVec = conceptVector(tokenize(`${doc.title} ${doc.content}`));
    const sim = cosine(qVec, dVec);
    if (sim > 0) scored.push({ doc, score: sim });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => toResult(s.doc, s.score));
}

function toResult(doc: CorpusDoc, score: number): RetrievalResult {
  const metadata: Record<string, unknown> = {};
  if (doc.file_path) metadata.file_path = doc.file_path;
  if (doc.confidence !== undefined) metadata.confidence = doc.confidence;
  if (doc.source_episode_ids) metadata.source_episode_ids = doc.source_episode_ids;
  if (doc.invalidated_at) metadata.invalidated_at = doc.invalidated_at;
  return { id: doc.id, source_type: doc.source_type, title: doc.title, content: doc.content, score, metadata };
}

// ─── Pipeline under test (mirrors UnifiedAssembler.assembleRanked) ───────────

const CHANNEL_TOPN = 30;
const FUSE_LIMIT = 10;

async function runPipeline(gq: GoldQuery): Promise<{ ranked: string[]; intent: QueryIntent }> {
  const intent = (await classifyIntent(gq.query)).intent; // rules-only (no embedding provider offline)
  const expansion = expandQuery(gq.query, intent);
  const lexList = bm25Channel(expansion.tokens, LEX_INDEX, CHANNEL_TOPN);
  const denseList = denseChannel(tokenize(gq.query), CHANNEL_TOPN);

  const stats = computeQueryStats(gq.query);
  const weights = adaptiveWeights(stats);
  const textBoostFn = (result: RetrievalResult): number => {
    const boost = lexicalTextScore(expansion.tokens, {
      name: result.title,
      file_path: result.metadata.file_path as string,
      signature: result.content,
    });
    return result.score * (1.0 + boost * weights.lexicalTextWeight);
  };

  const stBoost = inferSourceTypeBoost(gq.query);
  const boosts: BoostFactors | undefined = Object.keys(stBoost).length > 0
    ? { entity_boosts: {}, source_type_boosts: stBoost as BoostFactors['source_type_boosts'] }
    : undefined;

  const fused = rrfFusion([denseList, lexList], FUSE_LIMIT, 60, boosts, undefined, textBoostFn);
  return { ranked: fused.map((r) => r.id), intent };
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function recallAt(ranked: string[], relevant: Set<string>, k: number): number {
  const top = ranked.slice(0, k);
  let hit = 0;
  for (const id of top) if (relevant.has(id)) hit++;
  return relevant.size === 0 ? 0 : hit / relevant.size;
}

function precisionAt(ranked: string[], relevant: Set<string>, k: number): number {
  const top = ranked.slice(0, k);
  let hit = 0;
  for (const id of top) if (relevant.has(id)) hit++;
  return hit / k;
}

function mrr(ranked: string[], relevant: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) if (relevant.has(ranked[i])) return 1 / (i + 1);
  return 0;
}

function ndcgAt(ranked: string[], relevant: Set<string>, k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (relevant.has(ranked[i])) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(k, relevant.size); i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ─── Baselines (single channel, no fusion) ───────────────────────────────────

function channelOnly(gq: GoldQuery, which: 'lexical' | 'dense'): string[] {
  const expansion = expandQuery(gq.query);
  const list = which === 'lexical'
    ? bm25Channel(expansion.tokens, LEX_INDEX, FUSE_LIMIT)
    : denseChannel(tokenize(gq.query), FUSE_LIMIT);
  return list.map((r) => r.id);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

const LEX_INDEX = buildLexicalIndex();

// Quality gate thresholds — regression detection, set just below current measured
// values on the 37-doc golden set. (Thresholds were tuned on a smaller 23-doc set
// before distractors + a hard symbol-seeking query were added to de-saturate Recall@10;
// the de-saturated set is more discriminating, so nDCG/recall sit lower while staying a
// faithful gate.) Raising these as the pipeline improves locks in gains.
export const QUALITY_THRESHOLDS = {
  recallAt10: 0.90,
  ndcgAt10: 0.84,
  mrr: 0.88,
  intentAccuracy: 1.0,
  currentAboveStaleRate: 1.0, // current truth must always outrank the superseded fact
  maxStaleLeakRate: 0.0,      // no stale/invalidated doc in the top 3 of a conflict query
};

export interface PerQueryResult {
  query: string;
  intent: QueryIntent;
  intentOk: boolean;
  recall5: number;
  recall10: number;
  precision5: number;
  ndcg10: number;
  mrr: number;
  lexRecall10: number;
  denseRecall10: number;
  ranked: string[];
  missingTop10: string[];
}

export interface QualityReport {
  perQuery: PerQueryResult[];
  recall5: number;
  recall10: number;
  precision5: number;
  ndcg10: number;
  mrr: number;
  intentAccuracy: number;
  lexRecall10: number;
  denseRecall10: number;
  corpusSize: number;
  queryCount: number;
}

/** Run the full quality evaluation and return aggregate + per-query metrics. */
export async function runQualityEval(): Promise<QualityReport> {
  const perQuery: PerQueryResult[] = [];
  let intentHits = 0;

  for (const gq of QUERIES) {
    const relevant = new Set(gq.relevant);
    const { ranked, intent } = await runPipeline(gq);
    const intentOk = intent === gq.expectedIntent;
    if (intentOk) intentHits++;

    perQuery.push({
      query: gq.query,
      intent,
      intentOk,
      recall5: recallAt(ranked, relevant, 5),
      recall10: recallAt(ranked, relevant, 10),
      precision5: precisionAt(ranked, relevant, 5),
      ndcg10: ndcgAt(ranked, relevant, 10),
      mrr: mrr(ranked, relevant),
      lexRecall10: recallAt(channelOnly(gq, 'lexical'), relevant, 10),
      denseRecall10: recallAt(channelOnly(gq, 'dense'), relevant, 10),
      ranked,
      missingTop10: gq.relevant.filter((id) => !ranked.slice(0, 10).includes(id)),
    });
  }

  return {
    perQuery,
    recall5: mean(perQuery.map((p) => p.recall5)),
    recall10: mean(perQuery.map((p) => p.recall10)),
    precision5: mean(perQuery.map((p) => p.precision5)),
    ndcg10: mean(perQuery.map((p) => p.ndcg10)),
    mrr: mean(perQuery.map((p) => p.mrr)),
    intentAccuracy: intentHits / QUERIES.length,
    lexRecall10: mean(perQuery.map((p) => p.lexRecall10)),
    denseRecall10: mean(perQuery.map((p) => p.denseRecall10)),
    corpusSize: CORPUS.length,
    queryCount: QUERIES.length,
  };
}

export interface ConflictResult {
  query: string;
  currentRank: number;
  staleRank: number;
  currentAboveStale: boolean;
  staleInTop3: boolean;
}

export interface ConflictReport {
  perQuery: ConflictResult[];
  currentAboveStaleRate: number; // fraction where current outranks stale (target 1.0)
  staleLeakRate: number;         // fraction where a stale doc sits in the top 3 (target 0.0)
}

/**
 * Conflict / knowledge-update evaluation: when memory holds a current AND a superseded
 * fact on the same topic, the current one must outrank the stale one and the stale one
 * must stay out of the top of the context window. This is the dimension that decides
 * whether memory HELPS (current truth) or HURTS (stale assumptions) an agent.
 */
export async function runConflictEval(): Promise<ConflictReport> {
  const perQuery: ConflictResult[] = [];
  for (const cq of CONFLICT_QUERIES) {
    const { ranked } = await runPipeline({ query: cq.query, expectedIntent: 'SEMANTIC', relevant: [cq.current] });
    const currentRank = ranked.indexOf(cq.current);
    const staleRank = ranked.indexOf(cq.stale);
    perQuery.push({
      query: cq.query,
      currentRank,
      staleRank,
      currentAboveStale: currentRank >= 0 && (staleRank === -1 || currentRank < staleRank),
      staleInTop3: staleRank >= 0 && staleRank < 3,
    });
  }
  return {
    perQuery,
    currentAboveStaleRate: perQuery.filter((p) => p.currentAboveStale).length / perQuery.length,
    staleLeakRate: perQuery.filter((p) => p.staleInTop3).length / perQuery.length,
  };
}

async function main() {
  const verbose = process.argv.includes('--verbose');
  console.log('\n=== MemBerry Retrieval QUALITY Evaluation ===\n');
  const report = await runQualityEval();
  const conflict = await runConflictEval();
  console.log(`corpus: ${report.corpusSize} docs | queries: ${report.queryCount} | fuse limit: ${FUSE_LIMIT}\n`);

  for (const p of report.perQuery) {
    if (verbose || p.recall10 < 1.0 || !p.intentOk) {
      console.log(`Q: "${p.query}"  [intent ${p.intent}${p.intentOk ? '' : ` ≠ expected`}]`);
      console.log(`   R@5=${p.recall5.toFixed(2)} R@10=${p.recall10.toFixed(2)} P@5=${p.precision5.toFixed(2)} nDCG@10=${p.ndcg10.toFixed(2)} MRR=${p.mrr.toFixed(2)}  (lexR@10=${p.lexRecall10.toFixed(2)} denseR@10=${p.denseRecall10.toFixed(2)})`);
      if (p.missingTop10.length) console.log(`   MISSING from top-10: ${p.missingTop10.join(', ')}`);
      console.log(`   ranked: ${p.ranked.slice(0, 6).join(', ')}${p.ranked.length > 6 ? ' …' : ''}`);
      console.log('');
    }
  }

  console.log('─── Aggregate ───────────────────────────────────────────');
  console.log(`  Recall@5        : ${report.recall5.toFixed(3)}`);
  console.log(`  Recall@10       : ${report.recall10.toFixed(3)}`);
  console.log(`  Precision@5     : ${report.precision5.toFixed(3)}`);
  console.log(`  nDCG@10         : ${report.ndcg10.toFixed(3)}`);
  console.log(`  MRR             : ${report.mrr.toFixed(3)}`);
  console.log(`  Intent accuracy : ${report.intentAccuracy.toFixed(3)}`);
  console.log('─── Fusion lift (Recall@10) ─────────────────────────────');
  console.log(`  lexical-only    : ${report.lexRecall10.toFixed(3)}`);
  console.log(`  dense-only      : ${report.denseRecall10.toFixed(3)}`);
  console.log(`  fused           : ${report.recall10.toFixed(3)}  (lift over best single channel: +${(report.recall10 - Math.max(report.lexRecall10, report.denseRecall10)).toFixed(3)})`);

  console.log('─── Conflict / knowledge-update (current vs stale) ──────');
  for (const c of conflict.perQuery) {
    console.log(`  ${c.currentAboveStale ? '✓' : '✗'} "${c.query}" — current@${c.currentRank} vs stale@${c.staleRank}${c.staleInTop3 ? '  ⚠ stale in top-3' : ''}`);
  }
  console.log(`  current-above-stale: ${conflict.currentAboveStaleRate.toFixed(3)} | stale-leak (top-3): ${conflict.staleLeakRate.toFixed(3)}`);

  console.log('\n─── Quality gate ────────────────────────────────────────');
  let failures = 0;
  const check = (name: string, actual: number, threshold: number) => {
    const pass = actual >= threshold;
    console.log(`  ${pass ? '✓' : '✗'} ${name}: ${actual.toFixed(3)} (min ${threshold})`);
    if (!pass) failures++;
  };
  const checkMax = (name: string, actual: number, threshold: number) => {
    const pass = actual <= threshold;
    console.log(`  ${pass ? '✓' : '✗'} ${name}: ${actual.toFixed(3)} (max ${threshold})`);
    if (!pass) failures++;
  };
  check('Recall@10', report.recall10, QUALITY_THRESHOLDS.recallAt10);
  check('nDCG@10', report.ndcg10, QUALITY_THRESHOLDS.ndcgAt10);
  check('MRR', report.mrr, QUALITY_THRESHOLDS.mrr);
  check('Intent accuracy', report.intentAccuracy, QUALITY_THRESHOLDS.intentAccuracy);
  check('Current-above-stale', conflict.currentAboveStaleRate, QUALITY_THRESHOLDS.currentAboveStaleRate);
  checkMax('Stale-leak (top-3)', conflict.staleLeakRate, QUALITY_THRESHOLDS.maxStaleLeakRate);

  console.log(`\n=== Quality Eval Complete: ${failures === 0 ? 'ALL GATES PASSED' : `${failures} GATE(S) FAILED`} ===\n`);
  if (failures > 0) process.exit(1);
}

// Run as CLI only when invoked directly (not when imported by the regression test).
const invokedDirectly = process.argv[1]?.includes('quality-eval');
if (invokedDirectly) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
