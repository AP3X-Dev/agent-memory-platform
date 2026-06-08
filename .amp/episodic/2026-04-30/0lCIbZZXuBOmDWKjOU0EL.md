---
id: 0lCIbZZXuBOmDWKjOU0EL
session_id: autonomous-amp-wiki-cleanup-2026-04-29
agent_id: mcp
task: [project:agent-assist-cr] Resolve renderer-edit contradiction — supersede stale verbatim-renderer rule
created_at: "2026-04-30T06:46:04.044Z"
---

[project:agent-assist-cr] Renderer is no longer copied verbatim from the original engine. As of the 2026-04-15 v2 migration, src/electron/renderer/components/sop-panel.js is edited directly to remove v1 fallback branches (_cpDisplay, _ciDisplay, _prDisplay, _hotTopicLines, _formatHours, _flattenEscalationContacts, Full SOP scheduling+fees row). The project is v2-only going forward. Backend-side route aliasing remains the right tool for active contract drift on routes still in flux, but historical v1-only render paths are removed renderer-side, not papered over backend-side. Supersedes sem-dYjHraya30 (the verbatim-renderer rule, now decayed to 0.15).</content>
<outcome>approved</outcome>
<entities>["Agent-Assist-CR", "Electron Renderer"]</entities>
<tags>["project:agent-assist-cr", "architecture"]</tags>
<signals>[{"type": "correction", "target_id": "sem-dYjHraya30", "detail": "Renderer-side edits are explicitly allowed when removing v1 fallbacks; v2-only project policy"}]</signals>
</invoke>