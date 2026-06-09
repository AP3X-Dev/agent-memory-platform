---
id: vNChTRyJA4VSA48-Eh65h
session_id: session-20260419-120000
agent_id: mcp
task: [project:ap3x-solana] T50: CONTRIBUTING.md Jito proto refresh process + PRP-02 changeset
outcome: approved
created_at: "2026-04-20T08:38:14.231Z"
---

[project:ap3x-solana] T50 completed. Added "Vendored proto files / Jito proto files" section to docs/CONTRIBUTING.md between "Changeset workflow" and "Fixture capture". Section documents: why vendor, when to rev, step-by-step curl fetch + PINNED_COMMIT update, test command, PR convention, reviewer checklist. Created .changeset/prp-02-runtime-initial-release.md with minor bump for all 4 PRP-02 runtime packages (@ap3x/solana-signals, @ap3x/solana-strategy, @ap3x/solana-executor, @ap3x/solana-portfolio). Fixed group (@ap3x/solana-*) means all substrate packages bump in lockstep — only 4 new ones listed explicitly in the changeset per convention. Committed as 1f8d9a7. PRP-02 is now fully complete (T01–T50).