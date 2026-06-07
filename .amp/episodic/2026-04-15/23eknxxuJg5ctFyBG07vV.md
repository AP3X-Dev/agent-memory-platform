---
id: 23eknxxuJg5ctFyBG07vV
session_id: session-20260415-parity
agent_id: mcp
task: [project:agent-assist-cr] Parity fix: Chat / Call SOP / Full SOP surfacing regression against the original engine.
outcome: approved
created_at: "2026-04-15T18:07:09.538Z"
---

[project:agent-assist-cr] Clean-room rewrite had two surfacing regressions against the original engine:

1. Call SOP + Chat showed entire sections (whole fee table, both scheduling rules) when the LLM activated a section without naming a specific row. The resolver (`src/engine/agents/call_context_resolver.py`) deliberately widened on empty `matched_*` sets. Fixed by flipping to narrow-on-empty in `_populate_fees`, `_populate_scheduling`, `_populate_procedures`. The analysis prompt (`src/engine/agents/sop_chat.py::_ANALYSIS_PROMPT`) was also rewritten to make `matched_fee_type` / `matched_schedule_type` / `matched_procedure` REQUIRED for PRICING / HOURS+SCHEDULING / SPECIAL INSTRUCTION — ported the original engine's "one row, one tier" contract.

2. Full SOP tab rendered empty because shipping data files in `src/data/sops/` were v1 shape (flat strings, `mustBookAndJobTypes`, flat `clientProcedures.appointmentConfirmationEnabled`) but the renderer reads v2 field paths. User has an authoritative v2 source at `C:\Users\Guerr\Desktop\CIC\Client-SOPs\json\`. Fix: wiped v1 files, copied 7 v2 files in. SopTextLoader tolerates both snake_case and space-separated filenames.

Decision: project is v2-only going forward. Removed v1 fallback branches from resolver (`r.get("name") or r.get("type")` → `name`; `c.get("type") or c.get("service")` → `type`; split v1/v2 escalation loop) and from renderer adapters in `src/electron/renderer/components/sop-panel.js` (_cpDisplay, _ciDisplay, _prDisplay, _hotTopicLines, _formatHours, _flattenEscalationContacts, Full SOP scheduling+fees row code). 

Client filenames moved from snake_case to spaces (e.g. `Blue Valley Heating, Cooling and Plumbing.json`). Loader handles both. File set changed: dropped blanton_sons, chatfield_drilling, clark_plumbing, service_patriots (no v2 exists yet per user); added IAQ Medic, PSI, Stephen K Denny.

Tests: flipped one test (`test_no_matched_rows_emits_all_rows_for_section`) to narrow semantics and added two new tests for scheduling + procedures narrow-on-empty. Updated `test_hours_alert_activates_scheduling_fees_jobtype` to supply matched_* metadata. 943/943 non-perf tests pass; mypy strict + ruff clean on touched files.