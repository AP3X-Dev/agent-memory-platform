---
id: Z4kXMElM0Vx1DHH_GCqSc
session_id: session-20260527-120000
agent_id: mcp
task: [project:agent-assist-cr] Task 5: Add regression test for trade-override breaking (trade, job_type) lock in ExtractionPipeline
outcome: approved
created_at: "2026-05-28T03:43:50.387Z"
---

[project:agent-assist-cr] Task 5 complete. Added test_trade_override_breaks_existing_lock_and_relocks to tests/agents/test_extraction_pipeline.py. Key design decision: initial lock must form with a non-empty-but-unmapped equipment canonical type ("HVAC system" -> "hvac") so that last_canonical_type is seeded; otherwise _check_and_break_lock never fires when equipment first appears (it guards with `if js.last_canonical_type and ...`). The real SOPMatcher.match is exercised via _RealSOPMatcherWithInjectedSOP wrapper that injects a client_sop_dict with both HVAC and Plumbing trades — required because the override guard checks _supported_client_trades(client_sop_dict) before allowing the flip. Lock-break and relock both work correctly in production code; no bugs found.