---
id: sCTTAmv4Gr_pBBNOSINv9
session_id: session-20260512-085800
agent_id: mcp
task: [project:oni-grid] optimization session 21: config.rs + paths.rs Rust test coverage closes the persistence-layer arc
outcome: approved
created_at: "2026-05-12T16:02:33.412Z"
---

[project:oni-grid] Session 21 in `038480f`. Added test seams to paths.rs + config.rs and 14 tests. Closes the Rust persistence-module testing arc — all 7 Rust persistence modules now have unit-test coverage.

New conventions established:
- **`*_at(path: &Path, ...)` is the filesystem analog of `*_conn(conn: &Connection, ...)`.** Any Rust helper whose only side-effect against test-isolation is "where does the data live" should accept the path/connection explicitly. The Tauri command becomes a thin wrapper that resolves the global path/pool and calls the helper. New rule: any helper that today calls `dirs::home_dir()` or `pool.open(...)` or similar global-state resolvers should also have an `_at` / `_conn` variant.
- **The legacy `~/.agent-os` fallback needs explicit truth-table coverage.** All four combinations of (current exists, legacy exists) — neither / only legacy / only current / both — must pass, with the priority being: prefer current when both exist, prefer legacy only when current is absent. This is the spec from the optimizer prompt; the 4 tests in paths.rs lock all four cases.
- **Don't-touch-disk-on-parse-error is a subtle but load-bearing contract.** `set_config_value_at` must NOT create the config file when the typed-numeric parse fails partway through. Pinned via `assert!(!path.exists())` after a failed call — would break if a future "let me catch the error gracefully" refactor moves the write before the `?`.
- **Struct-update beats mutate-default under clippy field-reassign-with-default.** When seeding test data with a few non-default fields, use `AppConfig { theme: "...".to_string(), ..AppConfig::default() }` rather than `let mut x = default(); x.theme = ...`. Clippy with `-D warnings` rejects the latter. Cleaner intent too — every field at construction site rather than scattered.
- **`#[serde(default)]` on nested struct fields needs a round-trip pin.** AppConfig has 5 such nested sections (agents, merge, watchdog, providers, runtime). A future field added to e.g. AgentsConfig without a Default impl would silently break loading older config files. The round-trip test serializes default config, loads it back, and asserts equality on the re-serialized form — fails if any nested section drifts.

Rust persistence-layer test coverage now complete:
- pty.rs: 8 tests (Sessions 16-17)
- runs.rs: 10 tests (Session 9, pre-existing)
- mail.rs: 11 tests (Session 18)
- merge_queue.rs: 11 tests (Session 19)
- metrics.rs: 9 tests (Session 20)
- events.rs: 8 tests (Session 10, pre-existing)
- config.rs: 10 tests (Session 21)
- paths.rs: 4 tests (Session 21)

Cumulative session count this turn: 11 → 21 (11 sessions). Backlog: 20/30 complete + 4 discoveries (D4 closed). Rust test count: 54 → 104 (+50). TS test count: 1430 → 1496 (+66). Suite green throughout.

Next: Item #20 (component tests for RunModal / MergeQueue / DiffViewer). After that the remaining backlog is Block 5 (Plan Alignment: ONI Core / MemoryProvider / connection settings / real diff source) and Block 6 (Build infra: CI / stricter ESLint / code-splitting / bundle-size visualizer). Plus the three #30 sub-tasks (a/b/c).