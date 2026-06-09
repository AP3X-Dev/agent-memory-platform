---
id: 4H_-eJ-esTA2T473prO6c
session_id: session-20260429-backfill
agent_id: mcp
task: [project:agent-assist-cr] UI refinement — form simplification + panel surfacing rules
outcome: approved
created_at: "2026-04-29T12:12:44.454Z"
---

[project:agent-assist-cr] UI changes 2026-04-24 → 28.

Form-side: dropped Service Call Name as a free field (47178fe) — it now derives from the selected Outcome dropdown, removing one place where agents could hand-type inconsistent values. Outcome dropdown grouped with Service Call Name + Stage in a single row (dfbc24f); Complaint and Lead options dropped from the Outcome list since they are not legitimate booking outcomes for this product. Escalation added as a first-class Outcome (47178fe). Sidebar reordered: Guidelines now sits above Transcript (5822048) — Guidelines is the action surface, Transcript is reference, surface ordering should reflect that.

Tab strip: visible at boot rather than on first multi-Job event (d94ab05); manual trade selection on a Job unlocks probing for that trade immediately, so agents can drive without waiting for the classifier on borderline calls.

Full SOP panel: Service Area card removed (37b4d3c). Reasoning: the full SOP view is for reference, not for action; service-area gating already happens upstream at must-book qualification time, and the card was duplicating information without driving any decision. Honors the 'panel is an action surface' rule — anything that doesn't drive an action should not occupy panel real estate.

Renderer escape fix: JobTabsComponent._render properly escapes interpolations to prevent XSS via Job name/classification (acf6929).