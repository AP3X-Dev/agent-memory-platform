---
id: _88I8PlBc9PhvAhKBLhyj
session_id: amp-opt-s013b
agent_id: mcp
task: [project:amp] Item 12: Add path validation to amp_ingest and amp_compile
outcome: approved
created_at: "2026-04-09T12:00:34.890Z"
---

[project:amp] Completed Item 12 -- path validation for wiki tools. Added validatePath() and getAllowedBaseDir() to packages/wiki/src/tools.ts. Both amp_ingest (source_path) and amp_compile (output_dir) now validate that resolved paths are within the allowed base directory before calling into services. Uses AMP_INGEST_ALLOW_DIR env var with fallback to process.cwd(). The path.sep boundary check prevents prefix-based bypasses (e.g., /projects/amp-evil would not pass validation for base /projects/amp). 22 new tests covering unit validation, env var config, and handler integration. Full class coverage applied -- both ingest and compile paths are protected, not just the one mentioned in the backlog.