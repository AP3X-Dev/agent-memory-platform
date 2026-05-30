---
id: OHISbgSYiSeChbvX8SPyP
session_id: session-20260514-workspace18
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 18: add .oni/config.json parser and resolver (item #17)
outcome: approved
created_at: "2026-05-14T21:02:42.660Z"
---

[project:oni-grid] Completed item #17 — new pure src/lib/workspaceConfig.ts following the specContract.ts pattern: path builders (workspaceConfigPaths ordered user-project>worktree>repo, projectConfigSlug flattens path-like project ids) + tolerant parseWorkspaceConfig (malformed JSON/non-object root → empty config ok:false; unknown keys ignored; wrong-typed fields drop to empty; port entries filtered with default label) + resolveWorkspaceConfig (first PRESENT source wins, v1 no merging; a present-but-malformed file still wins so the operator sees their broken file rather than a silent fall-through). Zero filesystem access — caller does the I/O. Reused the WorkspaceConfig type from Session 7. Key design principle reinforced: a bad repo config file must never crash the cockpit — tolerance over strictness, and "present-but-broken wins" beats "silently skip to next layer" for operator clarity. User co-driving correction after commit: extracted an emptyWorkspaceConfig() factory because spreading {...EMPTY_WORKSPACE_CONFIG} is a shallow copy — the nested setup/run/teardown/ports arrays were shared and mutable across every parse result; the factory returns fresh arrays. Lesson: a module-level "empty/default" object with array fields is a shared-mutable-state trap; hand out fresh instances via a factory. Verification green: TS 1879/1879, lint, tsc, cargo 163/163, clippy.