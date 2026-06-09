---
id: DjDa7tmn4NbT5cPxL61-S
session_id: session-20260415-parity
agent_id: mcp
task: [project:agent-assist-cr] CSP decision: allow inline styles for SOP panel rendering
outcome: approved
created_at: "2026-04-15T18:29:40.112Z"
---

[project:agent-assist-cr] `src/electron/renderer/index.html` Content Security Policy relaxed: `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`. Before the change, `style-src 'self'` stripped every inline `style=""` attribute produced by `sop-panel.js::_renderFullSop` and `::_renderCallSop`, which ship inline styles on every `<td>`, `<div>`, card header, and color-coded badge. Symptom was flood of "Refused to apply inline style" warnings + the Full SOP rendering as an unstyled bag of text.

Rationale: SOP JSON comes exclusively from the local filesystem (data/sops/), is never user-entered, and passes through `_esc()` which HTML-escapes attribute values. XSS surface is narrow. If/when the renderer migrates inline styles to CSS classes in sop-panel.css, the CSP should be tightened back to `'self'`.

Left `login.html`'s CSP as-is (no inline styles there). Reloading the renderer (Ctrl+Shift+R / app restart) is required to pick up the new CSP meta since CSP is evaluated at document parse time.