---
id: B3wchjpVCcKRurRe51iS3
session_id: session-20260511-2138
agent_id: mcp
task: [project:oni-grid] optimization session 2: Item #2 blocked on full disk; audit finding preserved
created_at: "2026-05-12T04:44:07.141Z"
---

[project:oni-grid] Session 2 on opt/oni-grid-hardening — IN PROGRESS, reverted.

Audit finding (preserve for next attempt): The Tauri shell plugin (tauri-plugin-shell) has ZERO callers in this codebase.
- Frontend: no `@tauri-apps/plugin-shell` import; plugin is not in package.json.
- Rust: uses std::process::Command::new('git') in worktree.rs:15 — does NOT go through the Tauri shell plugin.
- lib.rs:18 registers `tauri_plugin_shell::init()` but nothing calls it.

Therefore Item #2's clean resolution is NOT to scope `shell:allow-execute` but to remove the plugin entirely:
1. Drop `shell:allow-open` and `shell:allow-execute` from src-tauri/capabilities/default.json
2. Drop `.plugin(tauri_plugin_shell::init())` line from src-tauri/src/lib.rs
3. Drop `tauri-plugin-shell = "2"` from src-tauri/Cargo.toml dependencies

These edits were applied and TS suite stayed green (1374/1374). They were REVERTED because cargo test could not link — `os error 112: There is not enough space on the disk` (C: drive 100% full, 49MB free of 219GB; src-tauri/target/ alone is 9.1GB). Loop rules forbid committing without a green cargo test.

Environmental blocker: user needs to free disk space (cargo clean inside agent-os/src-tauri/, or prune elsewhere) before resuming. Loop stopped — ScheduleWakeup NOT called.

Convention reinforced: when a backlog item's fix proves over-engineered relative to the actual codebase state, revise the item's scope rather than mechanically apply the originally-prescribed fix. Item #2's optimizer-prompt text assumed real shell usage; reality is no shell usage. Future sessions should always audit before applying — already in the workflow but reinforced here.

Note: if anything later needs the shell plugin (e.g., opening external help URLs from SettingsPanel), restore `tauri-plugin-shell` + `shell:allow-open` only (not `shell:allow-execute`).</content>
<parameter name="outcome">revised