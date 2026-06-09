---
id: L4RZ_oqFn_jKdtQmzppt4
session_id: scenario-replay-water-heater-2026-04-03
agent_id: mcp
task: [project:agent-assist-cr] Water heater scenario replay test across all 8 clients — full pipeline validation
outcome: approved
created_at: "2026-04-04T07:57:51.052Z"
---

[project:agent-assist-cr] Ran water-heater-pilot-light-wont-stay-lit recorded test scenario through full pipeline (Orchestrator + SOP Engine) for all 8 clients. 95/112 checks passed (85%).

**Scenario**: Plumbing, water heater pilot light won't stay lit. Customer David Reyes, member, Phoenix AZ. 35 utterances across 26 chunks.

**What worked well (8/8 across all clients):**
- Trade classification: Plumbing detected at 1.00 confidence for all clients
- Job Type: Must Book detected for all clients
- Customer name: "David Reyes" extracted correctly every time
- Customer city: "Phoenix" extracted correctly every time
- Membership tier: Correctly identified as "member" for all 8 clients
- SOP PRICING surfaced for all clients (correct fee rows populated)
- SOP SCHEDULING surfaced for all clients (must-book detected, schedule rows populated)
- SOP ESCALATION correctly absent for all clients
- Checklist auto-detection: 4-6 of 10 items auto-detected per client

**Systematic failures (STT-originated, not pipeline bugs):**
- Address: 0/8 — STT transcribed "3310 North 67th Avenue" as "3310 North 60... 7th Avenue" (split across chunks). Pipeline faithfully extracted the bad transcription. This is a transcription quality issue, not an extraction bug.
- Zip code: 1/8 — STT transcribed "85033" as "85 E 33" or "85E33". Same root cause.
- Phone: 7/8 — One client (Degree) got digits transposed. Partial number captured (missing last digits in some cases due to chunk boundaries).
- Email: 7/8 — One client (Chatfield) got "p.h.x" instead of "phx" because STT spelled out the letters.

**SOP behavior per client:**
- Blanton, Chatfield, Service Patriots: Correctly flagged trade-level SNP (don't provide Plumbing)
- Champion and Nash: Flagged geographic SNP (Arizona not in service area) — correct behavior
- Clark: Flagged inability to service hot water in AZ — correct
- Degree: Flagged water heaters that can't be restarted — appropriately specific
- Michael Bonsby: Surfaced full SNP list (7 items) — overkill, should only surface relevant ones
- Blue Valley: Clean run, no false SNP

**Key finding**: The two consistent failures (address, zip) trace back to STT transcription quality, not the analysis pipeline. The pipeline correctly extracts what it's given. Improving these requires either better STT accuracy or post-processing normalization for addresses/zips.