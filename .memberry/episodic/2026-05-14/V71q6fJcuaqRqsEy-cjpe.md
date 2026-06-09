---
id: V71q6fJcuaqRqsEy-cjpe
session_id: session-20260514-workspace13
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 13: convert Mission Board cards to spec/task/workspace hybrid cards
outcome: approved
created_at: "2026-05-14T20:02:57.968Z"
---

[project:oni-grid] Built buildMissionBoardCards in src/lib/missionBoardCards.ts — a pure projection of the spec/task/workspace slices into typed MissionBoardCard view models (spec card for a still-proposed SpecChange, backlog card for a task with no active workspace, workspace card for a task or orphan with an active workspace). Workspace cards carry live-derived workspaceStatus via deriveWorkspaceStatus plus scoped blockerCount/activePortCount; changedFileCount left undefined since a git diff is async and out of a pure selector's scope. Convention reinforced: when the optimizer lists a large UI component (KanbanBoard.tsx, 706 lines) for an item, split the view-model projection into a pure tested helper first and log the component rendering integration as a discovered item rather than rolling a component rewrite into the same session — keeps sessions bounded and card logic testable without mounting. Terminal workspaces (merged/archived/failed) deliberately produce no workspace card, matching findWorkspaceByTask's active-only contract. Discovered item #9 logged for the KanbanBoard.tsx rendering integration, folded into backlog #14.