---
id: q8kGfx9VvmUy80iRXY6J8
session_id: session-20260416-task13
agent_id: mcp
task: [project:agent-assist-cr] Task 13: Classification readiness gate — auto-activate scheduling + fees
outcome: approved
created_at: "2026-04-16T20:52:58.300Z"
---

[project:agent-assist-cr] Task 13 completed. Added _CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.7 constant and _is_call_classified() helper to call_context_resolver.py. The helper reads assist_state.classification.trade/.job_type/.trade_confidence/.job_type_confidence (sub-object path via ClassificationResult). In build_call_context, replaced the early-return guard with a computed `active` set that auto-unions "scheduling" and "fees" when classified is True, before gating on emptiness. CallSopState uses CallSopState() with no args (no create_empty factory). 27/27 resolver tests pass, 1040 total pass. Commit: 065786f.