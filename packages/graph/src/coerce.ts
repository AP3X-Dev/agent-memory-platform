/**
 * Neo4j integer coercion (Codebase Gotcha #1).
 *
 * Neo4j returns every `count(...)`, `size(...)`, degree, and integer property as
 * a BigInt-like `neo4j.Integer` object — NOT a JS number. Doing arithmetic on
 * the raw object yields `NaN` / `"[object Object]"`. Every integer read from
 * Neo4j in @amp/graph MUST pass through this helper before arithmetic.
 *
 * Mirrors the established convention at
 * `packages/code/src/symbol-store.ts:367` and `packages/wiki/src/lint.ts:88-91`.
 */
export function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') return Number(val);
  if (
    val != null &&
    typeof val === 'object' &&
    'toNumber' in val &&
    typeof (val as { toNumber: unknown }).toNumber === 'function'
  ) {
    return (val as { toNumber: () => number }).toNumber();
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/** True for a neo4j.Integer-like object (has a `toNumber` method). */
export function isNeo4jInt(val: unknown): val is { toNumber: () => number } {
  return (
    val != null &&
    typeof val === 'object' &&
    'toNumber' in val &&
    typeof (val as { toNumber: unknown }).toNumber === 'function'
  );
}
