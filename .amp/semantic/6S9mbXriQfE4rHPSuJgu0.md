---
id: 6S9mbXriQfE4rHPSuJgu0
confidence: 0.3
signal_count: 0
decay_class: stable
tags: []
created_at: "2026-04-09T12:08:00.180Z"
updated_at: "2026-04-09T12:08:00.180Z"
---

Hypothesis: The rate limit was TPM (tokens per minute) not RPM. Reducing SOP prompt from 33K to 10K chars on subsequent calls will eliminate rate limits.
Changes: SOP engine was sending full reference docs (global_rules, booking_methods, job_types, must_book_jobs) on every call — 33K chars of static context per call. At 16 calls/min = 132K tokens/min. Now first call includes full context (20K), subsequent calls only SOP + CIC (10K). Result: 41K tokens/min (70% reduction). Also dropped booking_methods and job_types entirely from SOP prompts — rarely needed for real-time alerts.
Result: e2e_latency_ms=5500 (keep)
Insight: The rate limit bottleneck was almost certainly TPM, not RPM. The SOP prompt was the biggest token consumer because it included 6 large reference documents on every call. Reducing to SOP + CIC only on subsequent calls is safe because the system prompt already contains the rules — the reference docs were redundant context. This also makes each call faster (fewer input tokens = faster LLM response).