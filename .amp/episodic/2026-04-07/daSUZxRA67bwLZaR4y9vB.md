---
id: daSUZxRA67bwLZaR4y9vB
session_id: probing-not-applicable-fix-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Fix probing questions showing "not applicable" incorrectly and answers getting locked
created_at: "2026-04-07T16:57:31.881Z"
---

[project:agent-assist-cr] Fixed two bugs in probing question answer application:

1. pipeline_applicator._apply_probing_answers: When LLM returns not_applicable=true AND answer="not applicable" simultaneously, the old code treated the answer text as a real answer (AUTO_DETECTED). Fixed by checking not_applicable flag FIRST — when set, any answer text is ignored and item goes to CONDITIONAL_HIDDEN.

2. assist_state._merge_checklist: The merge only overwrote AUTO_DETECTED answers if incoming confidence was higher. This meant "not applicable" stored with high confidence could never be replaced by a real answer with lower confidence. Also CONDITIONAL_HIDDEN items weren't treated as overwritable. Fixed by allowing any real answer to overwrite PENDING or CONDITIONAL_HIDDEN items regardless of confidence.

These two bugs combined meant: LLM incorrectly marks question as not_applicable with answer text → stored as AUTO_DETECTED with high confidence → later ticks with real answers get rejected by merge confidence check → answer permanently stuck as "not applicable".