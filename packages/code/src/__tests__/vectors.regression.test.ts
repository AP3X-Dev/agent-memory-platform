// packages/code/src/__tests__/vectors.regression.test.ts
import { describe, it, expect } from 'vitest';
import { generateMiniVector } from '../vectors.js';

describe('generateMiniVector regression', () => {
  it('BUG-0018: concurrent callers with different input dimensions produce correct-length results', async () => {
    // Before the fix, module-level mutable variables shared a single projection
    // matrix. Concurrent calls with different inDim values could interleave,
    // causing one call to read a matrix sized for a different dimension.
    // The fix uses a Map keyed by (inDim:outDim) so each dimension pair gets
    // its own independently cached matrix.

    const dense768 = new Array(768).fill(0).map((_, i) => Math.sin(i));
    const dense1536 = new Array(1536).fill(0).map((_, i) => Math.cos(i));
    const dense3072 = new Array(3072).fill(0).map((_, i) => Math.sin(i * 0.5));

    // Simulate concurrent calls with different input dimensions
    const [result768, result1536, result3072] = await Promise.all([
      Promise.resolve(generateMiniVector(dense768)),
      Promise.resolve(generateMiniVector(dense1536)),
      Promise.resolve(generateMiniVector(dense3072)),
    ]);

    // Each result must have the correct output dimension
    expect(result768).toHaveLength(64);
    expect(result1536).toHaveLength(64);
    expect(result3072).toHaveLength(64);

    // Each must be deterministic — calling again with same input gives same output
    expect(generateMiniVector(dense768)).toEqual(result768);
    expect(generateMiniVector(dense1536)).toEqual(result1536);
    expect(generateMiniVector(dense3072)).toEqual(result3072);

    // Results for different inputs must differ
    expect(result768).not.toEqual(result1536);
    expect(result1536).not.toEqual(result3072);
  });
});
