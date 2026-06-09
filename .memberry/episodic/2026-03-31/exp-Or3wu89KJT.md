---
id: exp-Or3wu89KJT
session_id: latency-research-session
agent_id: amp-researcher
task: [20260331-latency-reduction] experiment #0: Full latency audit found ~10.6s speech-to-transcript, ~20s speech-to-form-fields, ~13.6s speech-to-SOP. Major bottlenecks: (1) 7s chunk buffer, (2) sequential mic/sys transcription, (3) SOP feed blocks transcription thread 2-5s, (4) 2s polling interval with 4 sequential HTTP calls, (5) analysis every 42s (6 chunks × 7s), (6) 500ms merge loop sleep.
outcome: approved
created_at: "2026-03-31T18:55:20.044Z"
---

Hypothesis: Baseline latency measurement — trace all delay sources from speech to UI.
Changes: Full latency audit found ~10.6s speech-to-transcript, ~20s speech-to-form-fields, ~13.6s speech-to-SOP. Major bottlenecks: (1) 7s chunk buffer, (2) sequential mic/sys transcription, (3) SOP feed blocks transcription thread 2-5s, (4) 2s polling interval with 4 sequential HTTP calls, (5) analysis every 42s (6 chunks × 7s), (6) 500ms merge loop sleep.
Result: e2e_latency_ms=10600 (keep)
Insight: 8 optimization opportunities identified. Top 3 by impact: reduce chunk_seconds from 7 to 3-4s (saves 3-4s), parallelize mic/system transcription (saves ~1s), move SOP feed off chunk worker thread (prevents 2-5s blocking). Most gains are architectural, not model-dependent.