---
id: Jdci3e9MaQGUgjsmcyl8c
session_id: session-20260606-amp-gitignore
agent_id: mcp
task: [project:amp] Decide and enforce which docs ship vs. stay internal in the repo
outcome: approved
created_at: "2026-06-06T20:44:37.445Z"
---

[project:amp] Established repo convention for what ships vs. stays internal. ALL planning material — implementation plans, design docs, PRPs, handoffs — lives under docs/ and is gitignored wholesale (`docs/` plus patterns `PRPs/`, `*.prp.md`, `prp-*.md`, `*handoff*.md`, `*.plan.md`). Rationale: docs/ is 100% internal build-planning; the user wants consumers of the repo to get skills + agent instructions but NOT the planning docs. Agent instructions and skills deliberately live OUTSIDE docs/ (skills/, .claude/skills/ via the `!.claude/skills/` negation, .codex/, .augment/rules/, *.example templates, .cursorrules, packages/research/amp-researcher.md) so they remain tracked and shippable. Untracked docs/honcho-inspired-amp-enhancements.md (it had been committed in f472e93); it stays on disk but no longer ships. graphify + honcho enhancement plans now both ignored. Commit 3f62a48 on feat/honcho-enhancements. To publish a doc later, add a `!docs/<file>.md` negation.