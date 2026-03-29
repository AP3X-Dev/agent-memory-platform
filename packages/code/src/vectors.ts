// packages/code/src/vectors.ts
// Multi-vector generation: lexical hash, mini projection, sparse.
// Ported from Context-Engine scripts/ingest/vectors.py

import type { SparseVector } from './types.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const LEX_VECTOR_DIM = 4096;
const MINI_VEC_DIM = 64;
const MINI_VEC_SEED = 1337;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'to', 'is', 'it',
  'by', 'at', 'as', 'be', 'if', 'do', 'no', 'so', 'up', 'he', 'we', 'my',
]);

// ─── Identifier Splitting ────────────────────────────────────────────────────

/**
 * Split an identifier on camelCase, snake_case, and non-alphanumeric boundaries.
 * "getUserName" → ["get", "user", "name"]
 * "HTTP_STATUS_CODE" → ["http", "status", "code"]
 */
export function splitIdentifier(s: string): string[] {
  // Split on non-alphanumeric
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const tokens: string[] = [];

  for (const part of parts) {
    // Split camelCase: "getUserName" → ["get", "User", "Name"]
    const camelSplit = part.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g);
    if (camelSplit) {
      for (const token of camelSplit) {
        const lower = token.toLowerCase();
        if (lower.length > 1 && !STOP_WORDS.has(lower)) {
          tokens.push(lower);
        }
      }
    }
  }

  return tokens;
}

/**
 * Tokenize text for vector generation: split identifiers + words.
 */
export function tokenizeForVectors(text: string): string[] {
  const words = text.split(/\s+/);
  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(...splitIdentifier(word));
  }
  return tokens;
}

// ─── Lexical Hash Vector ─────────────────────────────────────────────────────

/**
 * Generate a dense lexical vector using hash-based token accumulation.
 * Each token is hashed, and vec[hash % dim] is incremented.
 * Result is L2-normalized.
 *
 * Uses a fast string hash (FNV-1a) since xxhash-wasm may not be loaded.
 * Falls back gracefully — no native dependency required.
 */
export function generateLexicalVector(text: string, dim = LEX_VECTOR_DIM): number[] {
  const tokens = tokenizeForVectors(text);
  const vec = new Float64Array(dim);

  for (const token of tokens) {
    const h = fnv1a(token);
    vec[Math.abs(h) % dim] += 1.0;

    // Bigram: hash consecutive pairs for phrase awareness
    // (applied inline — previous token stored below)
  }

  // Bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = tokens[i] + '_' + tokens[i + 1];
    const h = fnv1a(bigram);
    vec[Math.abs(h) % dim] += 0.5; // Half weight for bigrams
  }

  // L2 normalize
  l2Normalize(vec);

  return Array.from(vec);
}

// ─── Mini Vector (Random Projection) ─────────────────────────────────────────

/** Per-dimension cache of projection matrices, keyed by (inDim, outDim). */
const miniProjectionCache = new Map<string, Float64Array>();

/** Build a stable cache key for a given (inDim, outDim) pair. */
function projectionCacheKey(inDim: number, outDim: number): string {
  return `${inDim}:${outDim}`;
}

/**
 * Generate a mini vector via Rademacher random projection.
 * Compresses a dense vector (e.g., 1536-dim) to 64-dim for gate-first filtering.
 * The projection matrix is seeded for reproducibility.
 *
 * The projection matrix is cached per (inDim, outDim) pair so concurrent callers
 * with different input dimensions each get a correctly-sized matrix without
 * interfering with one another.
 */
export function generateMiniVector(denseVec: number[], outDim = MINI_VEC_DIM): number[] {
  const inDim = denseVec.length;
  const cacheKey = projectionCacheKey(inDim, outDim);

  // Lazy init: create and cache projection matrix per (inDim, outDim) pair
  let matrix = miniProjectionCache.get(cacheKey);
  if (!matrix) {
    matrix = createRademacherMatrix(inDim, outDim, MINI_VEC_SEED);
    miniProjectionCache.set(cacheKey, matrix);
  }

  // Matrix multiply: out = dense @ M
  const out = new Float64Array(outDim);
  for (let j = 0; j < outDim; j++) {
    let sum = 0;
    for (let i = 0; i < inDim; i++) {
      sum += denseVec[i] * matrix[i * outDim + j];
    }
    out[j] = sum;
  }

  l2Normalize(out);
  return Array.from(out);
}

// ─── Sparse Vector ───────────────────────────────────────────────────────────

/**
 * Generate a lossless sparse vector: {indices, values}.
 * Each token maps to a hash index with accumulated weight.
 * No dimension limit — uses full 32-bit hash space.
 */
export function generateSparseVector(text: string): SparseVector {
  const tokens = tokenizeForVectors(text);
  const weights = new Map<number, number>();

  for (const token of tokens) {
    const idx = Math.abs(fnv1a(token));
    weights.set(idx, (weights.get(idx) ?? 0) + 1.0);
  }

  // Bigrams at half weight
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = tokens[i] + '_' + tokens[i + 1];
    const idx = Math.abs(fnv1a(bigram));
    weights.set(idx, (weights.get(idx) ?? 0) + 0.5);
  }

  const indices: number[] = [];
  const values: number[] = [];
  for (const [idx, val] of weights) {
    indices.push(idx);
    values.push(val);
  }

  return { indices, values };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * FNV-1a hash — fast, deterministic, good distribution.
 * No native dependencies required.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0; // FNV prime, keep as 32-bit int
  }
  return hash;
}

/**
 * Create a seeded Rademacher random projection matrix.
 * Values are ±1 scaled by 1/√outDim.
 */
function createRademacherMatrix(inDim: number, outDim: number, seed: number): Float64Array {
  const matrix = new Float64Array(inDim * outDim);
  const scale = 1.0 / Math.sqrt(outDim);

  // Simple seeded PRNG (xorshift32)
  let state = seed;
  function nextRandom(): number {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
  }

  for (let i = 0; i < inDim * outDim; i++) {
    matrix[i] = (nextRandom() & 1) === 0 ? scale : -scale;
  }

  return matrix;
}

/**
 * In-place L2 normalization.
 */
function l2Normalize(vec: Float64Array): void {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  if (sumSq === 0) return;
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < vec.length; i++) {
    vec[i] /= norm;
  }
}
