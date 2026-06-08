---
id: La6Z23A4nVB-bxlJ72N2t
session_id: session-20260429-backfill
agent_id: mcp
task: [project:agent-assist-cr] Multi-job tickets feature — per-Job state with active_job indirection
outcome: approved
created_at: "2026-04-29T12:11:51.650Z"
---

[project:agent-assist-cr] Landed multi-job tickets feature (2026-04-23 → 04-24, branch feature/multi-job-tickets, merged 2026-04-24 in commit eb3e71f). Architectural shape: AssistState now holds `jobs: list[Job]` plus `active_job_index`; one Job per ticket within a single call. ExtractionPipeline keyed by Job.id via internal _JobPipelineState. All assist handlers, routes, applicators, and streaming readers now route through state.active_job instead of root-level fields.

Migration was phased deliberately. Slice 1 added Job model and the jobs list invariant with round-trip tests. Slice 2 introduced _sync_root_mirrors_from_active_job shim in pipeline_applicator so legacy root-level fields stayed populated while callers migrated. Slice 3 migrated each call site one at a time: in-place mutators, route handlers (assist + override_call_type tail-sync), streaming coordinator, FR22 classification, and test fixtures. Slice 4 deleted root-mirror fields outright (commit 5e52e57) along with the merge_from helpers.

Why phased rather than big-bang: the Electron renderer is copied verbatim from upstream and reads root-level fields. The shim let backend migrate without breaking the wire contract until the renderer-side getActiveJob helper landed (commit edde7bf). This honors the standing principle that contract drift is fixed backend-side, never renderer-side.

UI: JobTabsComponent (24c80ea) renders the multi-job tab strip; visible at boot even with one Job (d94ab05); IPC plumbing for add-job and set-active-job (75339fb); manual trade selection now unlocks probing per-Job. Routes: POST /sessions/{id}/jobs appends a blank Job (9faa364); POST /sessions/{id}/active_job switches the active Job (2b00a45).

Key invariant established: state.active_job is the single source of truth post-slice 4. Legacy root mirrors were a transition aid, not architecture. Tests now assert classification on active_job (cab7ab7, b31a5fc).