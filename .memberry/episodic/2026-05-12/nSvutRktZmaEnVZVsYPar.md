---
id: nSvutRktZmaEnVZVsYPar
session_id: session-20260512-resume5
agent_id: mcp
task: [project:oni-grid] optimization session 5 (resume): Item #5 — secret redaction in mail/event/notification persistence
outcome: approved
created_at: "2026-05-12T11:54:55.092Z"
---

[project:oni-grid] Completed Item #5 (commit aeca13b). Added redact module (Rust src-tauri/src/redact.rs + TS mirror src/lib/redact.ts) that masks api-key prefixes, Bearer tokens, AWS access keys, and FOO_TOKEN/SECRET/API_KEY/PASSWORD assignments. Applied at persistence boundary in mail.rs (subject/body/payload), events.rs (data column), notificationSystem.ts (title/message). 19 Rust + 17 TS unit tests, all green. Total: TS 1393/1393, Rust 26/26, lint+typecheck+clippy clean.

Key conventions established:
1. Persistence-boundary redaction (not parse-layer). sessionParser.ts was deliberately NOT modified — it parses Claude Code JSONL into in-memory aggregates that never hit a sink. Redact where data lands, not where it flows through.
2. Cheap pre-check before regex. Both implementations check for trigger substrings (sk-, ghp_, Bearer , TOKEN=, ...) via contains/indexOf before running 4 regex passes. Most payloads have no secrets and the early return matters.
3. Bearer token body must be >=16 chars to avoid matching English phrases like "Bearer of the news".
4. When patterns overlap on a payload, write tests for what actually fires. AWS_ACCESS_KEY_ID=... is caught by the AWS pattern, NOT the env-assignment pattern (which only matches _TOKEN/_SECRET/_API_KEY/_PASSWORD suffixes; _ID falls through). Initial test asserted the wrong pattern; fixed in flight.

Mode B audit confirmed metrics.rs and merge_queue.rs persist only structured/categorical fields — no additional redaction needed in those stores.

Next session: Item #6 — wire worktreePath through agentPipeline → spawnPty cwd.