---
id: mwr8R-BKy8PHPQiqrfQTl
session_id: session-20260606-amp-gitignore
agent_id: mcp
task: [project:amp] Execute the AMP → MemBerry rebrand across the monorepo
outcome: approved
created_at: "2026-06-07T02:41:01.175Z"
---

[project:amp] Executed the AMP → MemBerry rebrand on branch rebrand/memberry (7 commits off feat/honcho-enhancements), build + full suite green (1344 tests). Decisions: tool prefix berry_; tagline "MemBerry — persistent memory for AI agents"; CLEAN CUTOVER of MCP tool names (no amp_* aliases — discovered MCP SDK can't do hidden-but-callable tools, so aliases would either bloat the surface or break; user chose clean cutover); env vars dual-read via readEnv() in @memberry/core (MEMBERRY_* canonical, AMP_* fallback with one-time warning); URI scheme memberry:// canonical + amp:// legacy-accepted.

Groups: (1) @amp/* → @memberry/* npm scope (nothing published, pure internal). (2) 49 tool names amp_* → berry_* via uniform perl rename protecting amp_id; handler-map keys, domain maps, descriptions, tests all renamed in lockstep. (3) env shim. (4) on-disk formats: memberry:// + managed-block MEMBERRY:BEGIN with tolerant (?:AMP|MEMBERRY) matcher so legacy blocks replace not duplicate. (5) prose/brand: mechanical token sed + a 15-agent workflow for the brand WORD across docs, + .ts UI/CLI/prompt strings. (6) ops: server name memberry-mcp, systemd units renamed, Dockerfile/compose, memberry bin added alongside amp, brand-agnostic hook detector. (7) added REBRAND-GUARD test (exactly 49 berry_*, 0 amp_*, 8 always-on + 41 on-demand) + fixed README 7→8 default-tool count.

KEPT as internal/data tokens (renaming would orphan live data): project:amp scope tag, ~/.config/amp + ./.amp dirs, amp: Redis key prefix, amp:/amp_id compiled-wiki anchors, _amp settings hook marker, docker external volumes amp_neo4j_data/_plugins, repo path /home/cerebro/projects/amp, internal symbol names (AMPService/createAMPServer/AMPConfig/AmpUri/AMP_HOOK_EVENTS). Skill dir/handle names kept as 'amp' (hosts don't alias skill names).

REMAINING MANUAL (not in branch): live-machine systemd cutover + npm install + restart; update user's global ~/.claude/CLAUDE.md amp_* → berry_* (clean cutover means old names are gone); optional GitHub repo rename agent-memory-platform → memberry. Full plan + runbook in docs/rebrand-memberry-plan.md (gitignored). NOT pushed; NOT merged.