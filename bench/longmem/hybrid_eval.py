#!/usr/bin/env python3
"""
LongMemEval-S retrieval, testing AMP's ACTUAL architecture: hybrid dense+lexical RRF fusion
(not the lexical-only adapter, which tied BM25). Compares, on the standard benchmark:

  - BM25            (lexical only)            <- the baseline AMP tied in recall_eval.ts
  - Dense           (MiniLM embeddings only)
  - Hybrid (RRF)    (dense + lexical, k=60)   <- AMP's real retrieval design

Metric: Recall@k that the gold evidence session is surfaced. Deterministic, free (local
MiniLM model, no API). The question: does AMP's hybrid fusion BEAT pure BM25 here, and
where (esp. the lexically-hard 'preference' category)?

Run:  python hybrid_eval.py [numQuestions] [k]
"""
import json
import sys
from collections import defaultdict

DATA = ('/home/cerebro/.cache/huggingface/hub/datasets--xiaowu0162--longmemeval/'
        'snapshots/2ec2a557f339b6c0369619b1ed5793734cc87533/longmemeval_s')
RRF_K = 60


def rrf(rank_lists, n):
    scores = defaultdict(float)
    for ranking in rank_lists:           # ranking = list of doc indices, best first
        for rank, idx in enumerate(ranking):
            scores[idx] += 1.0 / (RRF_K + rank + 1)
    return [i for i, _ in sorted(scores.items(), key=lambda kv: -kv[1])][:n]


def recall_at(top, gold_idxs, k):
    return 1 if any(g in top[:k] for g in gold_idxs) else 0


def main():
    numq = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    k = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    from sentence_transformers import SentenceTransformer
    from rank_bm25 import BM25Okapi
    import numpy as np

    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
    data = json.load(open(DATA))
    step = max(1, len(data) // numq)
    sample = [d for i, d in enumerate(data) if i % step == 0][:numq]

    agg = {m: [] for m in ('bm25', 'dense', 'hybrid')}
    by_cat = defaultdict(lambda: defaultdict(list))

    for qi, q in enumerate(sample):
        sids = q['haystack_session_ids']
        gold = [sids.index(a) for a in q['answer_session_ids'] if a in sids]
        if not gold:
            continue
        docs = ['\n'.join(f"{t['role']}: {t['content']}" for t in sess)
                for sess in q['haystack_sessions']]
        query = q['question']

        # Lexical (BM25)
        bm25 = BM25Okapi([d.lower().split() for d in docs])
        bm_scores = bm25.get_scores(query.lower().split())
        bm_rank = list(np.argsort(-bm_scores))

        # Dense (MiniLM cosine)
        emb = model.encode([query] + docs, normalize_embeddings=True, show_progress_bar=False)
        sims = emb[1:] @ emb[0]
        dn_rank = list(np.argsort(-sims))

        # Hybrid (RRF of the two)
        hy_rank = rrf([bm_rank, dn_rank], len(docs))

        for name, rank in (('bm25', bm_rank), ('dense', dn_rank), ('hybrid', hy_rank)):
            r = recall_at(list(rank), gold, k)
            agg[name].append(r)
            by_cat[q['question_type']][name].append(r)
        if (qi + 1) % 20 == 0:
            print(f"  ...{qi+1}/{len(sample)}", file=sys.stderr)

    mean = lambda xs: sum(xs) / len(xs) if xs else 0
    n = len(agg['bm25'])
    print(f"\n=== LongMemEval-S Recall@{k} ({n} questions) — AMP hybrid vs channels ===\n")
    for name in ('bm25', 'dense', 'hybrid'):
        print(f"  {name:8} {mean(agg[name]):.3f}")
    print(f"\n  hybrid − bm25 delta: {mean(agg['hybrid']) - mean(agg['bm25']):+.3f}\n")
    print(f"--- Recall@{k} by category ---")
    for cat in sorted(by_cat):
        b, d, h = (mean(by_cat[cat][m]) for m in ('bm25', 'dense', 'hybrid'))
        print(f"  {cat:26} bm25 {b:.2f}  dense {d:.2f}  hybrid {h:.2f}  (h−b {h-b:+.2f})")


if __name__ == '__main__':
    main()
