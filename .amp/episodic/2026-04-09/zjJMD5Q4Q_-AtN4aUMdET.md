---
id: zjJMD5Q4Q_-AtN4aUMdET
session_id: amp-opt-s015
agent_id: mcp
task: [project:amp] Item 14 - Fix silently swallowed errors across AMP codebase
outcome: approved
created_at: "2026-04-09T12:25:44.294Z"
---

[project:amp] Completed Item 14: Added console.error logging to 14 silent catch blocks across 7 packages (code/indexer, core/import, retrieval/assembler, retrieval/deterministic, retrieval/intent, oni/store, wiki/viewer). Audited all 30 production files with catch statements. Classified 21 empty/comment-only catches into two categories: 14 that needed logging (error information was being discarded) and 7 that are legitimately silent (shutdown cleanup, filesystem stat probing, git exit code flow control). All error messages follow consistent pattern with package-prefixed tags. 980 tests pass, 0 failures. Combined with 5 prior discovery fixes (D3/D4/D7/D8/D10), the project now has zero production catch blocks that silently discard error information without justification.