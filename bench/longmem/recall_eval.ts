#!/usr/bin/env tsx
// bench/longmem/recall_eval.ts
//
// Retrieval-recall evaluation on the STANDARD LongMemEval-S benchmark (Wu et al. 2024).
// For each question, the "memory" is 54 multi-session chat histories; the system must
// surface the gold evidence session(s) in its top-k recall. This is the retrieval task
// LongMemEval analyzes, run with MemBerry's REAL ranking (reusing the MemBench MemBerry adapter:
// rrfFusion + provenance + inferred-supersession) vs a BM25 baseline.
//
// Deterministic, no LLM. Metric: Recall@k (gold answer_session_id present in top-k) +
// MRR, overall and per question category.
//
// Run: npx tsx bench/longmem/recall_eval.ts [numQuestions] [k]

import { readFileSync } from 'fs';
import { AmpAdapter, KeywordAdapter, NaiveRecencyAdapter } from '../membench/adapters.js';
import type { MemoryItem, MemorySystemAdapter } from '../membench/types.js';

const DATA = '/home/cerebro/.cache/huggingface/hub/datasets--xiaowu0162--longmemeval/snapshots/2ec2a557f339b6c0369619b1ed5793734cc87533/longmemeval_s';

interface LMEQuestion {
  question_id: string;
  question_type: string;
  question: string;
  question_date: string;
  haystack_dates: string[];
  haystack_session_ids: string[];
  haystack_sessions: Array<Array<{ role: string; content: string }>>;
  answer_session_ids: string[];
}

function parseTs(date: string, fallback: number): number {
  // "2023/05/20 (Sat) 02:21" -> drop the "(Day)" then Date.parse
  const cleaned = date.replace(/\([A-Za-z]+\)\s*/, '');
  const t = Date.parse(cleaned);
  return Number.isFinite(t) ? t : fallback;
}

function sessionsToItems(q: LMEQuestion): MemoryItem[] {
  return q.haystack_sessions.map((turns, i) => ({
    id: q.haystack_session_ids[i],
    text: turns.map((t) => `${t.role}: ${t.content}`).join('\n'),
    ts: parseTs(q.haystack_dates[i] ?? '', i),
  }));
}

async function rankIds(adapter: MemorySystemAdapter, items: MemoryItem[], query: string, k: number): Promise<string[]> {
  await adapter.reset();
  for (const it of items) await adapter.remember(it);
  return (await adapter.recall(query, { k })).map((r) => r.id);
}

function recallAt(top: string[], gold: string[]): number {
  const set = new Set(top);
  // LongMemEval answers usually live in 1 evidence session; recall = any gold session present.
  return gold.some((g) => set.has(g)) ? 1 : 0;
}

function mrr(top: string[], gold: string[]): number {
  const g = new Set(gold);
  for (let i = 0; i < top.length; i++) if (g.has(top[i])) return 1 / (i + 1);
  return 0;
}

async function main() {
  const numQ = parseInt(process.argv[2] ?? '60', 10);
  const k = parseInt(process.argv[3] ?? '5', 10);
  const all: LMEQuestion[] = JSON.parse(readFileSync(DATA, 'utf-8'));
  // Evenly sample across the file (deterministic).
  const step = Math.max(1, Math.floor(all.length / numQ));
  const sample = all.filter((_, i) => i % step === 0).slice(0, numQ);

  const adapters: Record<string, MemorySystemAdapter> = {
    MemBerry: new AmpAdapter(),
    'Keyword(BM25)': new KeywordAdapter(),
    NaiveRecency: new NaiveRecencyAdapter(),
  };

  const agg: Record<string, { recall: number[]; mrr: number[] }> = {};
  const byCat: Record<string, Record<string, number[]>> = {};
  for (const name of Object.keys(adapters)) agg[name] = { recall: [], mrr: [] };

  for (const q of sample) {
    const items = sessionsToItems(q);
    // The gold evidence session ids are present directly in haystack_session_ids.
    const goldIds = q.answer_session_ids.filter((g) => q.haystack_session_ids.includes(g));
    if (goldIds.length === 0) continue; // skip if evidence session isn't in the haystack

    for (const [name, adapter] of Object.entries(adapters)) {
      const top = await rankIds(adapter, items, q.question, k);
      const r = recallAt(top, goldIds);
      const m = mrr(top, goldIds);
      agg[name].recall.push(r);
      agg[name].mrr.push(m);
      (byCat[q.question_type] ??= {});
      (byCat[q.question_type][name] ??= []).push(r);
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(`\n=== LongMemEval-S retrieval recall@${k} (${sample.length} questions) ===\n`);
  console.log(`${'system'.padEnd(16)}${`Recall@${k}`.padEnd(12)}MRR`);
  console.log('─'.repeat(40));
  for (const name of Object.keys(adapters)) {
    console.log(`${name.padEnd(16)}${mean(agg[name].recall).toFixed(3).padEnd(12)}${mean(agg[name].mrr).toFixed(3)}`);
  }
  console.log('\n--- Recall@' + k + ' by category (MemBerry vs BM25) ---');
  for (const cat of Object.keys(byCat).sort()) {
    const a = mean(byCat[cat].MemBerry ?? []);
    const b = mean(byCat[cat]['Keyword(BM25)'] ?? []);
    console.log(`  ${cat.padEnd(26)} MemBerry ${a.toFixed(2)}  BM25 ${b.toFixed(2)}  Δ ${(a - b >= 0 ? '+' : '') + (a - b).toFixed(2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
