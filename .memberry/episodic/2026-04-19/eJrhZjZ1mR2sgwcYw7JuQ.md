---
id: eJrhZjZ1mR2sgwcYw7JuQ
session_id: session-20260418-cr-punchlist
agent_id: mcp
task: [project:agent-assist-cr] Publish clean-room rewrite to github.com/Contractor-in-Charge/agent-assist while preserving original history
outcome: approved
created_at: "2026-04-19T02:52:16.469Z"
---

[project:agent-assist-cr] Clean-room rewrite published to GitHub with original history preserved. Repo: github.com/Contractor-in-Charge/agent-assist (private).

Pre-push state: local 95-commit history on main (clean-room rewrite), GitHub had 227-commit history from original codebase. git merge-base returned empty — fully disjoint histories. Zero shared commits.

Strategy (recorded so future pushes follow the same pattern): archive-then-force-push, NEVER merge --allow-unrelated-histories. Clean-room rewrites should never be tree-merged against the original; the resulting Frankenstein merge commit and mass conflict resolution would pollute the rewrite.

Execution order (SAFE refs pushed FIRST, then force-push):
1. git branch legacy origin/main  (local snapshot at 8489542)
2. git tag v1-original origin/main  (immutable snapshot at 8489542)
3. git push -u origin legacy  (new branch on remote, no overwrite)
4. git push origin v1-original  (new tag on remote, no overwrite)
5. VERIFY via gh api / git ls-remote that legacy + v1-original are live
6. git push --force-with-lease origin main  (overwrites origin/main 8489542 -> 830165b)

Post-push GitHub state:
- refs/heads/main -> 830165b (95-commit rewrite, latest commit: "Add FEATURES inventory and CHANGELOG")
- refs/heads/legacy -> 8489542 (227-commit original, latest: "merge: correctness & startup fixes")
- refs/tags/v1-original -> 8489542 (immutable snapshot for permanent reference)

Key properties validated before force-push: no branch protection on main (gh api returned 404), no open PRs (the refs/pull/1/head is a closed PR — harmless historical ref), no tags to preserve on remote, single-branch repo on remote. Low blast radius.

Workflow going forward: owner pushes directly to main (no branch protection, solo private repo — PRs not required). Never push to legacy and never open PR from legacy -> main (that would propose merging the original back into the rewrite). GitHub's "legacy had recent pushes" banner is a generic new-branch prompt and can be ignored/dismissed.