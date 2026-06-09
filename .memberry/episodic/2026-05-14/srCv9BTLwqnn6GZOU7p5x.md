---
id: srCv9BTLwqnn6GZOU7p5x
session_id: session-20260514-workspace15
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 15: add workspace card action toolbar (item #14)
outcome: approved
created_at: "2026-05-14T20:28:19.188Z"
---

[project:oni-grid] Completed backlog item #14 — workspace card action toolbar (run/stop/terminal/preview/diff/merge/archive) on MissionCard. Key convention established: a two-layer enablement split. Layer 1 — workspaceCardActions(card) is a pure projection of the card view model computing view-model enablement + a disabled reason; this is what the optimizer's "disabled/enabled by card view model" test targets, so it is exhaustively unit-tested. Layer 2 — the renderer applies a WIRED_WORKSPACE_ACTIONS gate so a button is enabled only when the view model allows it AND a backend capability actually exists; this UI-side gate can shrink as backends land without touching the pure projection. Honored the no-fabricated-backends rule: only 'archive' has a real store hook today (updateWorkspace → sticky 'archived' status); the other five render present-but-disabled with a "not available yet" title. Also reinforced: a workspace with stored status running/review but no live signals derives to 'idle' via deriveWorkspaceStatus (review is only derived from finished sessions), and findWorkspaceByTask drops merged/archived/failed workspaces — so board tests exercising workspace cards must use idle status. Verification all green: TS 1854/1854, lint, tsc, cargo 163/163, clippy.