---
id: BCgpcoC6cO7F0Ozdz23Rf
confidence: 0.3
signal_count: 0
decay_class: stable
tags: []
created_at: "2026-04-09T12:08:00.258Z"
updated_at: "2026-04-09T12:08:00.258Z"
---

Hypothesis: Reducing API pressure by gating SOP feed, skipping trivial chunks, and adding retry will prevent rate limits while maintaining acceptable latency.
Changes: Chunk size backed from 4s to 5s. SOP feed gated to same cadence as analysis (every 3 chunks). Trivial chunks skipped. Retry with exponential backoff on 429. Estimated ~16 gpt-5.4 calls/min (was ~30). Configuration analysis showed Conservative (7s/4) at 8.6 calls/min, Current (5s/3) at 16, Balanced (5s/2+4) at 21. User reported form didn't populate until end of 4-min call — likely rate limit cascading: SOP calls consuming gpt-5.4 quota, pipeline calls failing/queuing behind.
Result: e2e_latency_ms=8000 (keep)
Insight: Rate limit pressure comes from SOP + pipeline competing for gpt-5.4 quota. SOP prompts are large (full SOP JSON + accumulated transcript). The solution may be to use a cheaper model for SOP (gpt-5.4-mini was noisy but functional) or to make SOP feed use section-selective loading to reduce prompt size. Need to test live to see if 16 calls/min is sustainable.