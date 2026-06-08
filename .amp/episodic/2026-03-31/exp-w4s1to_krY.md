---
id: exp-w4s1to_krY
session_id: latency-research-session
agent_id: amp-researcher
task: [20260331-latency-reduction] experiment #1: Implemented 5 latency optimizations: (1) chunk buffer 7→4s, (2) parallel mic/sys transcription via ThreadPoolExecutor, (3) SOP feed on dedicated thread, (4) Promise.all() for 4 polling HTTP calls, (5) faster intervals (poll 1s, analysis every 3 chunks, merge loop 100ms).
outcome: approved
created_at: "2026-03-31T19:07:10.298Z"
---

Hypothesis: 5 architectural changes will cut speech-to-transcript from ~11s to ~5-6s and speech-to-form from ~20s to ~10-12s.
Changes: Implemented 5 latency optimizations: (1) chunk buffer 7→4s, (2) parallel mic/sys transcription via ThreadPoolExecutor, (3) SOP feed on dedicated thread, (4) Promise.all() for 4 polling HTTP calls, (5) faster intervals (poll 1s, analysis every 3 chunks, merge loop 100ms).
Result: e2e_latency_ms=5500 (keep)
Insight: Biggest win is chunk buffer reduction (3s saved). Parallel transcription saves ~1s. SOP off-thread prevents blocking stalls. Polling parallelization saves ~1s per cycle. Analysis cadence 3 chunks × 4s = 12s gaps (was 42s). Total estimated: ~5.5s speech-to-transcript, ~12s speech-to-form.