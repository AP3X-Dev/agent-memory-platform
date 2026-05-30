---
id: IYa4HD8Sqjf-dLlTSAQSh
session_id: oni-code-lifecycle-fixes-20260401
agent_id: mcp
task: [project:oni-code] Lifecycle bugs fixed — 95/95 tests pass, zero failures
outcome: approved
created_at: "2026-04-02T02:40:10.560Z"
---

[project:oni-code] All lifecycle bugs from code review fixed:

1. SessionStore async/sync: Removed misleading async from synchronous fs methods. All callers updated. No more unhandled ENOENT during teardown.

2. Permission/tool-error boundary: Wrapped evaluate() in try/catch so evaluation failures fall through to tool. Added path traversal detection in PreToolUse that returns descriptive error ("Path traversal detected: escapes root directory") preserving the tool-error contract.

3. Swarm checkpoint pendingAgents: Fixed extractPendingAgents to check _error markers on raw agent results. Failed agents now correctly classified as pending, not completed.

RESULTS: 95/95 test files pass, 1221/1221 tests, 0 failures, typecheck clean, build clean, package 374 files / 1.3MB.

REVIEWER RATINGS IMPROVEMENT:
- Source quality: 7/10 → maintained
- Reliability/operational polish: 5/10 → improved (0 test failures now)
- Package readiness: C- → improved (proper entrypoint, clean dist, .npmignore)