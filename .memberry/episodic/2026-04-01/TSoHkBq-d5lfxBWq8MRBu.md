---
id: TSoHkBq-d5lfxBWq8MRBu
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Future optimization: Stage 2 locking for cost reduction
created_at: "2026-04-01T20:16:06.918Z"
---

[project:agent-assist-cr] FUTURE OPTIMIZATION — Stage 2 classification locking.

Concept: Once Stage 2 (SOP classification) produces a confident trade classification (2 consecutive same results), lock trade and stop re-running Stage 2 every cycle. Job_type continues updating since it can change (maintenance → must book). Stages 1+3 always run since facts and probing answers update as conversation develops.

Estimated savings: gpt-5.4 calls drop from 40 to 5-8 per 10-min call. Cost from ~$0.046 to ~$0.015-0.020.

NOT implementing now because: facts change mid-call (furnace → oil boiler, maintenance → emergency). Locking too early risks stale classification. Need to figure out the right re-evaluation trigger (Stage 1 equipment type change, new trade keywords) before this is safe.

Current approach: run all 3 stages every cycle, Stage 2 on gpt-5.4, Stages 1+3 on gpt-4o-mini. No gating. Everything always updates. ~$0.046/call.