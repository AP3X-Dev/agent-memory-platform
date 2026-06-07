// MemBench regression gate: MemBerry must beat the naive/keyword baselines on the
// agent-relevant memory dimensions (conflict, stale, contamination), not just recall.
// This pins the benchmark's discriminating power AND MemBerry's lead over alternatives.

import { describe, expect, it } from 'vitest';
import { runMemBench } from '../../../../bench/membench/run.js';

describe('MemBench — MemBerry vs baselines', () => {
  it('MemBerry scores highest composite and beats keyword on conflict/stale/contamination', async () => {
    const reports = await runMemBench();
    const amp = reports.find((r) => r.adapter === 'MemBerry')!;
    const keyword = reports.find((r) => r.adapter === 'Keyword(BM25)')!;
    const naive = reports.find((r) => r.adapter === 'NaiveRecency')!;

    // MemBerry leads overall on the agent-relevant quality dimensions.
    expect(amp.composite).toBeGreaterThan(keyword.composite);
    expect(amp.composite).toBeGreaterThan(naive.composite);
    expect(amp.composite).toBeGreaterThanOrEqual(0.95);

    // MemBerry's edge is specifically the dimensions a plain lexical memory ignores:
    // currency (conflict, incl. INFERRED implicit supersession), stale-suppression,
    // and project isolation — while keeping recall intact (supersession is subject-scoped).
    expect(amp.byDimension.conflict).toBeGreaterThan(keyword.byDimension.conflict);
    expect(amp.byDimension.stale).toBeGreaterThan(keyword.byDimension.stale);
    expect(amp.byDimension.contamination).toBeGreaterThan(keyword.byDimension.contamination);
    expect(amp.byDimension.recall).toBe(1);
  });
});
