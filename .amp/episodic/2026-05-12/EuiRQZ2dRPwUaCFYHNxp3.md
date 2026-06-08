---
id: EuiRQZ2dRPwUaCFYHNxp3
session_id: session-20260512-072000
agent_id: mcp
task: [project:oni-grid] optimization session 11: Item #30 coordinator blocked-question control loop (first pass)
outcome: approved
created_at: "2026-05-12T14:27:49.520Z"
---

[project:oni-grid] Completed first pass of Item #30 in `25c0a7c`. Root cause of the original misroute: ChatSidebar's `executeConductorCommand` escaped any operator text as `claude "<text>"` and spawned it in the next idle pane — generic control phrases like "answer any questions" or "full permissions" got treated as new agent prompts instead of follow-ups for an already-blocked pane.

Two-layer fix.

Layer 1 (dispatcher short-circuit): new `src/lib/conductorRouting.ts` exports `findCoordinatorControlTargets` which runs *before* the escape/spawn block. If the message matches one of six control patterns AND there are active panes, it returns blocked-then-active panes and ChatSidebar writes a rewritten follow-up to each existing PTY rather than spawning anything new. The control patterns also match "you have permissions", "proceed/continue/resume", and "pick reasonable defaults".

Layer 2 (autonomous answering): conductor learned an `answer` action. `buildRoutineBlockAnswer(output)` scans the last 4000 chars of pane output for: highlighted/default interactive prompts (returns ''), numbered options (returns '1'), permission/approval words (returns 'y'), or generic what/which/should questions (returns a default-policy instruction). Credentials (api key/token/password/secret) and destructive ops (rm -rf, git reset --hard, force push, drop table, format) return null. `useConductor` auto-writes the answer when `pane.autoAccept === true`; otherwise persists a Coordinator chat decision card with Accept/Decline.

Conventions established (worth carrying forward):
- **autoAccept is the autonomy switch.** Reusing the existing per-pane field rather than inventing a parallel "autonomy level" enum keeps the policy boundary in one place. Auto-write only when autoAccept is true; everything else surfaces a decision card.
- **`ChatDecision` is a field on ChatMessage, not a sibling type.** Optional `decision?: ChatDecision` rendered inline by ChatMessageBlock. Memo comparator extended to track decision identity.
- **Runtime visibility ≠ runtime type.** `LAUNCHABLE_RUNTIMES = ['claude','codex','opencode']` is the *display* set; `PaneState.runtime: RuntimeId` keeps the full union (legacy panes may persist gemini/copilot). `isLaunchableRuntime` guard + fallback to claude in the renderer preserves backward compat without advertising unsupported runtimes.
- **Tauri drag regions must propagate.** TopBar inner spans/divs that overlay the bar must each carry `data-tauri-drag-region` or the drag silently dies in that region. New shared `DRAG_REGION_PROPS` const so future children stay consistent. `OniLogo` got `pointerEvents: 'none'` so it doesn't intercept.

Remaining Item #30 work, split into the optimizer log as #30a/b/c:
- #30a: emit `agent.blocked`, `coordinator.followup_sent`, `coordinator.auto_answered` via eventEmit.ts.
- #30b: broaden detection patterns (codex/opencode CLI shapes, multi-step interactive forms).
- #30c: escalate to a decision card when an auto-answered pane stays blocked across multiple ticks.

Verification: TS 1443/1443 (+13), ESLint clean, tsc clean, cargo test 54/54, cargo clippy clean. The 700+ diff lines (498 code + ~200 docs) exceeded the per-session line budget, but the work was a pre-existing in-progress state that was coherent and green; committing and splitting #30a/b/c keeps the line budget intact going forward.