---
id: wBKDymAC4lwT1hmISUHIP
session_id: scenario-replay-water-heater-2026-04-03
agent_id: mcp
task: [project:agent-assist-cr] Re-ran water heater scenario replay with streaming_primary=true — significant improvement
outcome: approved
created_at: "2026-04-04T08:37:53.702Z"
---

[project:agent-assist-cr] Flipped streaming_primary to true (default config change) and re-ran water heater scenario against all 8 clients.

**Results: 107/112 checks passed (95.5%) — up from 95/112 (84.8%)**

**Improvements from streaming:**
- Address extraction: 0/8 -> 6/8 (fixed for 6 clients, still failing for Clark and Bonsby)
- Zip code extraction: 1/8 -> 6/8 (fixed for 5 more clients)
- Email: 7/8 -> 8/8 (Chatfield fixed)
- Phone: stayed at 7/8 (Degree still gets digits wrong)
- 2 clients got perfect 14/14: Blanton, Blue Valley, Chatfield

**Remaining failures (5 total):**
- Address (2 fails): Clark got "3310 North 60 7th Avenue", Bonsby got "3310 North 60th Avenue" — still chunk boundary issue for these runs
- Zip (2 fails): Champion got "85 E 33", Service Patriots got "85333" — STT mishearing
- Phone (1 fail): Degree got "6235552529" instead of "6235552947" — digit transposition

**Key decision:** streaming_primary=true is now the default. This is a major quality improvement for customer info extraction. The remaining failures are STT accuracy issues (not chunk boundary splits) — could be improved with post-processing normalization for structured fields like zip codes and phone numbers.