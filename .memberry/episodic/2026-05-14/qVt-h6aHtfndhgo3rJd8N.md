---
id: qVt-h6aHtfndhgo3rJd8N
session_id: session-20260514-workspace14
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 14: render Mission Board hybrid cards in KanbanBoard (discovered item #9)
outcome: approved
created_at: "2026-05-14T20:14:54.958Z"
---

[project:oni-grid] Wired buildMissionBoardCards into KanbanBoard.tsx — replaced the per-Task TaskCard with a MissionCard that switches on card.kind (spec/backlog/workspace). Cards group into status columns by card.taskStatus; spec proposals have no task so columnForCard places them in TODO until approved. Spec cards render without pointer handlers / data-task-id so drag/drop only applies to task-backed cards. Two conventions reinforced: (1) when a component starts reading new store slices, its hand-rolled test mock's StoreShape must grow to match or selectors silently return undefined and feed undefined arrays into pure helpers — KanbanBoard.test.tsx needed specChanges/workspaces/workspacePorts/agentSessions/agentBlockers added. (2) Mixing a `border` shorthand with a `borderLeft` longhand triggers a React rerender warning when hover handlers write `borderColor`; use an `inset` box-shadow for an accent stripe instead. Scope split per loop guidance: this session = rendering integration only; the 7-action workspace toolbar (run/stop/terminal/preview/diff/merge/archive) stays as backlog #14. Verification all green: TS 1841/1841, lint, tsc, cargo 163/163, clippy.