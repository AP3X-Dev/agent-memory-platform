// packages/retrieval/src/intent.ts
// Intent classification: rules-first + embedding fallback.
// Routes queries to the optimal retrieval strategy.
// Ported from Context-Engine scripts/intent_classifier.py

import type { EmbeddingProvider } from '@memberry/core';

// ─── Intent types ────────────────────────────────────────────────────────────

export type QueryIntent = 'GRAPH' | 'SEMANTIC' | 'IDENTIFIER' | 'HYBRID';

export interface IntentResult {
  intent: QueryIntent;
  confidence: number;
  method: 'rules' | 'embedding' | 'fallback';
}

// ─── Rules-based patterns (compiled once) ────────────────────────────────────

const GRAPH_PATTERNS: RegExp[] = [
  /\bwho calls\b/i,
  /\bwhat calls\b/i,
  /\bcallers?\s+of\b/i,
  /\bcall graph\b/i,
  /\busages?\s+of\b/i,
  /\breferences?\s+to\b/i,
  /\bimports?\s+of\b/i,
  /\bwho imports\b/i,
  /\bdepends?\s+on\b/i,
  /\bdependenc(y|ies)\s+of\b/i,
  /\binherits?\s+from\b/i,
  /\bextends?\b.*\bclass\b/i,
  /\bimplements?\b/i,
  /\bwhat uses\b/i,
  /\bwhat depends\b/i,
  /\bimpact\s+of\b/i,
  /\bblast radius\b/i,
  /\baffected\s+by\b/i,
  /\bdownstream\b/i,
  /\bupstream\b/i,
];

const SEMANTIC_PATTERNS: RegExp[] = [
  // Interrogative forms — cover the full auxiliary-verb range, not just "how does".
  // Agents phrase the same question many ways ("how does X work", "how are X handled",
  // "why do we use X", "what is the strategy"); all are narrative/semantic intents.
  /\bhow (do(es)?|did|is|are|can|should|would|to)\b/i,
  /\bwhy (do(es)?|did|is|are|was|were|should)\b/i,
  /\bwhat (is|are|does|do)\b/i,
  /\bexplain\b/i,
  /\bdescribe\b/i,
  /\bwhat is the purpose\b/i,
  /\barchitecture\b/i,
  /\bdesign\b.*\bdecision\b/i,
  /\boverview\b/i,
  /\bstrategy\b/i,
  /\bapproach\b/i,
];

const IDENTIFIER_PATTERNS: RegExp[] = [
  /^[A-Z][a-zA-Z0-9]*$/,                       // PascalCase single word
  /^[a-z][a-zA-Z0-9]*$/,                        // camelCase single word
  /^[a-z]+(_[a-z]+)+$/,                          // snake_case
  /^[A-Z]+(_[A-Z]+)*$/,                          // UPPER_SNAKE
  /\bfind\s+(function|class|method|type|interface)\b/i,
  /\bwhere is\b.*\bdefined\b/i,
  /\blocate\b.*\b(class|function|method)\b/i,
  /\bdefinition\s+of\b/i,
];

// ─── Embedding-based exemplars ───────────────────────────────────────────────

const EXEMPLARS: Record<QueryIntent, string[]> = {
  GRAPH: [
    'who calls this function',
    'find all callers of this method',
    'what functions call get_user',
    'show references to this class',
    'what imports this module',
    'what depends on the auth service',
    'show the call graph for validate',
    'find all usages of this type',
    'what would break if I change this',
    'impact analysis for this function',
    'show downstream dependencies',
    'who uses this interface',
    'inheritance chain for this class',
    'what implements this trait',
  ],
  SEMANTIC: [
    'how does authentication work',
    'explain the caching strategy',
    'what is the purpose of this module',
    'describe the architecture of the API layer',
    'why was this design decision made',
    'overview of the payment flow',
    'how is error handling done',
    'what is the testing strategy',
  ],
  IDENTIFIER: [
    'find function get_user',
    'where is AuthService defined',
    'locate the Config class',
    'find the validateToken method',
    'definition of UserRepository',
  ],
  HYBRID: [
    'find error handling in auth module',
    'show database queries in user service',
  ],
};

const INTENT_THRESHOLDS: Record<QueryIntent, number> = {
  GRAPH: 0.55,
  SEMANTIC: 0.65,
  IDENTIFIER: 0.50,
  HYBRID: 0.65,
};

// ─── Cached exemplar embeddings ──────────────────────────────────────────────
// WeakMap keyed by provider instance — allows GC when provider is released,
// and correctly re-computes if a different provider is used.

const exemplarCache = new WeakMap<EmbeddingProvider, Map<QueryIntent, number[][]>>();

async function getExemplarEmbeddings(embedding: EmbeddingProvider): Promise<Map<QueryIntent, number[][]>> {
  const cached = exemplarCache.get(embedding);
  if (cached) return cached;

  const computed = new Map<QueryIntent, number[][]>();
  for (const [intent, texts] of Object.entries(EXEMPLARS)) {
    const embeddings = await embedding.embedBatch(texts);
    computed.set(intent as QueryIntent, embeddings);
  }
  exemplarCache.set(embedding, computed);
  return computed;
}

// ─── Classification ──────────────────────────────────────────────────────────

/**
 * Classify a query into one of 4 intents.
 * Rules-first (fast, no API calls), embedding fallback (accurate).
 */
export async function classifyIntent(
  query: string,
  embedding?: EmbeddingProvider,
): Promise<IntentResult> {
  // Guard: empty or very short queries
  if (!query || query.trim().length < 2) {
    return { intent: 'HYBRID', confidence: 0.3, method: 'fallback' };
  }

  // Guard: very long queries — skip embedding, rules only
  if (query.length > 5000) {
    return classifyByRules(query) ?? { intent: 'HYBRID', confidence: 0.4, method: 'fallback' };
  }

  // Step 1: Rules-based classification
  const rulesResult = classifyByRules(query);
  if (rulesResult) return rulesResult;

  // Step 2: Embedding-based classification (if provider available)
  if (embedding) {
    try {
      const embResult = await classifyByEmbedding(query, embedding);
      if (embResult) return embResult;
    } catch (err: unknown) {
      // Embedding failed — fall through
    }
  }

  // Step 3: Fallback to HYBRID
  return { intent: 'HYBRID', confidence: 0.5, method: 'fallback' };
}

function classifyByRules(query: string): IntentResult | null {
  const trimmed = query.trim();

  // Check identifier patterns first (single-word lookups)
  const words = trimmed.split(/\s+/);
  if (words.length <= 2) {
    for (const pattern of IDENTIFIER_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { intent: 'IDENTIFIER', confidence: 0.85, method: 'rules' };
      }
    }
  }

  // Check graph patterns
  for (const pattern of GRAPH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: 'GRAPH', confidence: 0.9, method: 'rules' };
    }
  }

  // Check semantic patterns
  for (const pattern of SEMANTIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: 'SEMANTIC', confidence: 0.85, method: 'rules' };
    }
  }

  // Check multi-word identifier patterns
  for (const pattern of IDENTIFIER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: 'IDENTIFIER', confidence: 0.8, method: 'rules' };
    }
  }

  return null; // No confident rules match
}

async function classifyByEmbedding(
  query: string,
  embedding: EmbeddingProvider,
): Promise<IntentResult | null> {
  const exemplars = await getExemplarEmbeddings(embedding);
  const queryVec = await embedding.embed(query);
  const queryNorm = l2Norm(queryVec);

  let bestIntent: QueryIntent = 'HYBRID';
  let bestSim = -1;

  for (const [intent, vecs] of exemplars) {
    for (const exemplarVec of vecs) {
      const sim = cosineSimilarity(queryVec, exemplarVec, queryNorm, l2Norm(exemplarVec));
      if (sim > bestSim) {
        bestSim = sim;
        bestIntent = intent;
      }
    }
  }

  const threshold = INTENT_THRESHOLDS[bestIntent];
  if (bestSim >= threshold) {
    return { intent: bestIntent, confidence: bestSim, method: 'embedding' };
  }

  return null; // Below threshold
}

// ─── Vector math ─────────────────────────────────────────────────────────────

function l2Norm(vec: number[]): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[], normA: number, normB: number): number {
  if (normA === 0 || normB === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (normA * normB);
}
