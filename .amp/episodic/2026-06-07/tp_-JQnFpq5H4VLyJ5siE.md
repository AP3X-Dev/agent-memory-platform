---
id: tp_-JQnFpq5H4VLyJ5siE
session_id: session-20260607-ag3ntic-prpv2
agent_id: mcp
task: Record that the Computer Capability PRP v2 amendments were applied.
outcome: approved
created_at: "2026-06-07T12:58:07.276Z"
---

DONE: the Computer Capability amendments are now applied to PRP v2 (the previously-flagged follow-up). Edits across 7 section files in _v2_build, all from one shared canonical spec so the computer.* action set + risk levels are identical everywhere: §12 (added `computer` to the CapabilityManifest type enum + §12.2 table row + §12.14.7 manifest stub with all 11 computer.* ToolActions), §16 (new §16.12.1 "Built-in Computer Capability" + added Computer to the §16.2 system-seed registry list), §30 (seed entry + full risk/default table + health check + test task, marked MVP-OPTIONAL/Advanced), §13 (computer-backed runtime composition note), §14 (Computer container is separate from the lean headless Hermes image), §17 (computer.* gated like any capability — (computer,action), default-deny, fail-closed), §32 (WS viewer/terminal = post-MVP). Canonical computer.* actions: screenshot/read_text/move/scroll=low/allow; click/type/key/open_url=medium/allow; write_file=medium/approval_required; bash/run_python=high/approval_required. The Computer capability is MVP-OPTIONAL/Advanced-mode (NOT on the Sales Researcher golden path). v2 re-assembled = ~205,415 words / 20,141 lines. Planning snapshot refreshed (_archive\ag3ntic-planning-snapshot-2026-06-07.zip, 46 entries). Minor residual (downstream detail, not blocking): §12.3.2 Pydantic discriminated union has no explicit ComputerManifest subclass yet. PRP v2 spec and the morph build plan now agree on the Computer capability.