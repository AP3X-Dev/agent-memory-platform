---
id: C7OBkTTobIyA6aLfy7cEm
session_id: session-20260512-0510
agent_id: mcp
task: [project:oni-grid] optimization session 3: remove unused tauri plugins (fs, process, os) — Item #3
created_at: "2026-05-12T11:19:11.594Z"
---

[project:oni-grid] Session 3 COMPLETE on opt/oni-grid-hardening (commit e982dfb).

Fixed: Three Tauri plugins removed in one bundled commit — tauri-plugin-fs, tauri-plugin-process, tauri-plugin-os. Files: capabilities/default.json (drops 8 perms: 6 fs:* + process:default + os:default), lib.rs (drops 3 .plugin(...) inits), Cargo.toml (drops 3 deps), Cargo.lock (sheds ~128 lines transitive). Item scope was revised in flight from "scope fs:* to project roots" to "remove the 3 unused plugins entirely" — same audit pattern as Item #2 (shell plugin).

Root cause: scaffold cruft. create-tauri-app registers fs/process/os/shell by default; they survived into a project that never used them. All Rust I/O is std::fs / std::process direct (worktree.rs, session.rs, config.rs, paths.rs). Frontend never imported any of these plugins; only @tauri-apps/plugin-dialog has a real caller (TopBar.tsx:179 open() for file picker).

Conventions reinforced:
- "Audit before applying the prescribed fix" — 3 sessions in a row where this changed the action (Item #1 confirmed, Items #2 + #3 revised). When the optimizer-prompt's text was written, it assumed real usage that the code didn't have. Future sessions should always read affected code before applying.
- "Bundle related no-op removals" — when discovery finds another instance of the same fix pattern (here: two more unused plugins), bundling avoids multiple slow cargo builds. Single commit, single verification pass.

Performance:
- Warm-cache cargo: clippy 44s (vs cold 4m 07s last session). Test compile near-instant.
- Session 3 wall clock ~3 minutes (compared to 11+ min cold-build Session 2).

Capability surface now: 8 permissions remain in default.json (window controls + dialog:allow-open) — half the original. Smaller attack surface for any future renderer compromise.

Verification: TS 1374/1374, ESLint 0/0, tsc clean, cargo test 7/7, cargo clippy clean.

Signal: reinforces the scaffold-cruft pattern. Next time a Tauri-permission audit is needed elsewhere, expect the same pattern — most listed perms will be unused.</content>
<parameter name="outcome">approved