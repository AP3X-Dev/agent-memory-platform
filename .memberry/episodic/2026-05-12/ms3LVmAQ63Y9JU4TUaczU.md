---
id: ms3LVmAQ63Y9JU4TUaczU
session_id: session-20260512-0500
agent_id: mcp
task: [project:oni-grid] optimization session 2 (retry): remove unused tauri-plugin-shell (Item #2)
created_at: "2026-05-12T11:09:53.956Z"
---

[project:oni-grid] Session 2 retry COMPLETE on opt/oni-grid-hardening (commit e5d3ab3).

Fixed: tauri-plugin-shell removed entirely (5 files: capabilities/default.json drops shell:allow-open + shell:allow-execute; lib.rs drops .plugin(tauri_plugin_shell::init()); Cargo.toml drops tauri-plugin-shell = "2"; Cargo.lock sheds 110 lines of transitive deps; log updated). Backlog item scope was revised in flight: original prompt anticipated scoping a permission, but audit showed the plugin had zero callers so removal was stronger.

Root cause: scaffold cruft. Tauri's create-app template adds the shell plugin by default; it was never used here. std::process::Command::new("git") in worktree.rs handles git invocation directly without the plugin's permission model.

Conventions established (new):
- "Audit before applying the prescribed fix" — backlog items written before deep code reading can be over- or under-scoped. This is the second item where the audit changed the action (Item #1 the audit confirmed; Item #2 the audit revised). Sessions should always read the affected files first and decide whether the prescribed fix still fits.
- Removing scaffold cruft from Tauri capabilities is preferred over scoping when the underlying plugin has zero callers.

Discovery (Mode B):
- 4 additional silent .catch(() => {}) sites beyond the one Item #4 already lists: src/hooks/useConductor.ts:80, src/components/ChatSidebar.tsx:{1215, 1312, 1315}. Folded into Item #4's scope (logged in Discovered Items table as D1) rather than creating a new backlog item.
- npm audit (production deps): 0 vulnerabilities. Baseline confirmed clean.

Performance baseline (cold cargo build after `cargo clean`):
- cargo test 11m 04s (cold)
- cargo clippy --all-targets -D warnings 4m 07s (warm after test build)
- Future sessions should preserve target/ to keep these fast.

Verification: TS 1374/1374 pass, ESLint 0/0, tsc clean, cargo test 7/7, cargo clippy clean.

Signal: reinforces the "tauri-plugin-shell has ZERO callers" fact stored last session — confirmed by acting on it.</content>
<parameter name="outcome">approved