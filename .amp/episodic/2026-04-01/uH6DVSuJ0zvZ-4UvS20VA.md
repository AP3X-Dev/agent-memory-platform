---
id: uH6DVSuJ0zvZ-4UvS20VA
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Downstream trigger strategy decision
created_at: "2026-04-01T05:12:09.693Z"
---

[project:agent-assist-cr] Decision: Hybrid trigger strategy (option C) for downstream consumers with time-based fallback.

Rationale: Two real-world edge cases drive the need for a time-based safety net alongside utterance-end triggers:
1. Talkative customers who won't stop — utterance_end never fires, so a massive transcript accumulates before any analysis runs. This creates a latency spike and wastes the real-time advantage.
2. Noisy backgrounds — ambient noise prevents DeepGram from detecting speech end, so the system thinks the speaker is still talking indefinitely.

Design: Use utterance_end as primary trigger for fast operations (entity extraction, SOP alerts). Use time-based fallback (every N seconds) as a ceiling — if utterance_end hasn't fired within the time window, trigger analysis anyway. This mirrors the current chunk-cadence behavior but with the added benefit of firing earlier when natural pauses occur.

Key insight from user: "If we can detect the utterance end, and it's not past a certain time limit, then that's fine." This means: utterance_end preferred, time-based as ceiling, not floor.