---
id: O5E_uhtq902ca_8KHDbyh
session_id: oni-code-audit-fixes-20260401
agent_id: mcp
task: [project:oni-code] Code review findings addressed — package hygiene fixed, skill regression was test pollution
outcome: approved
created_at: "2026-04-02T02:23:47.399Z"
---

[project:oni-code] Code review findings addressed:

FINDING 1 (High — package entrypoint): FIXED
- Created src/index.ts as library entrypoint exporting Conductor, ToolPool, PermissionContext, SessionStore, etc.
- dist/index.js now exists after build

FINDING 2 (High — test/publish pipeline): FIXED
- vitest.config.ts excludes dist/ (was running tests twice — 190 files → 95)
- tsconfig.json excludes test files from compilation (no .test.js in dist)
- Added prebuild script to clean dist before build (prevents stale artifacts like conflict-detector.js)
- Added .npmignore excluding src/, test files, dev config
- Package size: 374 files / 1.3MB (was 646 / 2.4MB)

FINDING 3 (Medium — create_skill regression): NOT A REGRESSION
- skill.test.ts passes 13/13 in src-only mode
- The "failures" were from running compiled dist/tools/skill.test.js alongside src/tools/skill.test.ts
- Fixing Finding 2 (excluding dist from vitest) resolved this

FINDING 4 (Medium — conductor.ts size): ACKNOWLEDGED, MITIGATED
- Already extracted 6 collaborators: ToolPool, PermissionContext, SubagentExecutor, CompactionManager, Coordinator, WorktreeManager
- Conductor is the top-level orchestrator — remaining 1,801 lines is inherent to its role
- chat() generator pattern is tightly coupled to conversation state and yield semantics
- Further decomposition would add indirection without reducing complexity

FINAL TEST RESULTS: 93/95 files pass, 1219/1221 tests pass, typecheck clean.
2 remaining failures are pre-existing Windows environment issues.