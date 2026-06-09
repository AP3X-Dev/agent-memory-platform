---
id: jCXCUQ17TM-ciy3XFmpjB
session_id: session-20260512-105400
agent_id: mcp
task: [project:oni-grid] optimization session 25: ONI/AMP/Cerebro connection settings + persistence
outcome: approved
created_at: "2026-05-12T17:58:36.240Z"
---

[project:oni-grid] Session 25 in `fab9843`. Item #23 done — three-backend connection UI + Rust persistence wired.

Conventions established for connection/credential UI:
- **`type="password"` on every credential input.** Browsers mask the value, screenshots and over-shoulder reviewers can't read it, the store round-trip is unaffected. Rule: any input whose value is a bearer token / API key / secret gets `type="password"` even if the field has no security boundary today.
- **Placeholder hint that values are "Stored but unused" — manage user expectations.** Item #21 + #22 + #23 all sit in the "integration point landed, transport deferred to sidecar" pattern. The UI explicitly tells the operator that filling these fields doesn't activate the backends. Without this, the first user to flip `oni_harness_enabled` and paste a token thinks it's broken when nothing happens. The text comes out only once the sidecar wires the connections.
- **Dotted config keys map 1:1 to nested struct fields.** `set_config_value_at` continues the existing pattern: one match arm per leaf (`connections.oni.host` → `config.connections.oni.host = value.to_string()`). No JSON parsing, no nested walks. Future nested config additions follow the same shape — one new match arm per new leaf.
- **`#[serde(default)]` on every new nested config field.** Same rule from Sessions 21 + 22 — every new field gets `#[serde(default)]` so legacy `~/.oni-grid/config.toml` files load without migration. The serde-default test pins this so a future struct addition without a Default impl fails loudly here.
- **Settings-panel component tests render the full panel + click the section tab.** Sections only reach their content via the SectionContent router, so component tests for a specific section must navigate to it via the side-nav. Pattern: render full SettingsPanel, `fireEvent.click(screen.getByRole('button', { name: /Connections/i }))`, then assert against the now-visible section. The "save handler" the spec asks for is the change handler on the input + the store action; mutating the storeState object inside the mock's setConnection lets assertions read it back without re-rendering.

Cumulative this turn: 15 sessions, 24/30 items complete + 4 discoveries. TS 1430 → 1558 (+128). Rust 54 → 109 (+55).

Next: Item #24 (replace SAMPLE_DIFF_LINES in DiffViewer with real diff source). The linter's been attempting this refactor across the past few sessions (touched DiffViewer.tsx repeatedly); a focused session can finish it properly now that the prerequisite work (worktreePath in store, EventTimeline, etc.) is in place.