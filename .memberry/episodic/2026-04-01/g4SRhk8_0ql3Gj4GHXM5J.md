---
id: g4SRhk8_0ql3Gj4GHXM5J
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Stage 2 locking test results and lock key fix
outcome: revised
created_at: "2026-04-01T20:44:59.346Z"
---

[project:agent-assist-cr] Stage 2 locking test with gpt-5.4: 5 consecutive runs on same transcript.

Results: Stage 2 ran 2x, locked on run 2, skipped runs 3-5. Probing 6/6 all runs. Customer info 4/4 all runs. Equipment 5/5 all runs.

Issue found: gpt-5.4 returned job_type=Must Book on run 1 but Demand Service on run 2. Since lock only checked trade (both HVAC), it locked the wrong job_type. Classification scored 3/3 on run 1 but 2/3 on runs 2-5.

Fix applied: lock key now requires BOTH trade AND job_type to match consecutively. If gpt-5.4 flip-flops between Must Book and Demand Service, the lock won't engage until it stabilizes on one. This means slightly more gpt-5.4 calls (3-4 instead of 2) but prevents locking an incorrect job_type.

Note: gpt-5.4 inconsistency on job_type (Must Book vs Demand Service) for AC stopped cooling is a known issue. The SOP prompt may need tightening on must-book criteria for this scenario.