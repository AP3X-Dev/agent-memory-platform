---
id: IcpBgDnow23diAZdtvNqz
session_id: session-20260604-stuck-call
agent_id: mcp
task: Diagnose Bonsby call stuck on "Listening…"/"Awaiting submit" 11+ min, empty form, never finalizes
outcome: approved
created_at: "2026-06-04T13:23:31.283Z"
---

Root mechanism (code-confirmed across renderer/main/backend): a backend death or hang DURING a call or while awaiting-submit freezes the CIC Assistant UI unrecoverably — "Listening…" + empty form + "Awaiting submit" — with no error and no auto-recovery, because all three safety nets are gated off in exactly those states:
- Status is Electron-local (main.js:1342 getStatus uses currentSessionId/lastCompletedSessionId), not backend health.
- Poll loop swallows unreachable (polling.js:51 .catch(()=>null)); renderer simply stops updating, no offline transition.
- Only post-boot health loop defers all recovery while busy (main.js:590 isSafeForMemoryRecovery = !currentSessionId && !lastCompletedSessionId); respawn only on process exit, never on hang (python-backend.js:121).
Empty form + perpetual "Listening…" with audible audio means the backend delivered nothing the whole call (pipeline never ran), not a bad extraction. Trigger candidates: token-refresh backend restart mid-call; drain phase-3 LLM call with no preemptive timeout (drain_coordinator.py _run_final_notes/_run_form_review; form-review holds assist-store lock at :335); WASAPI capture on a silent device (Audio read error on mic/system, seen Jun-1); missing portal AI keys at boot. External taskkill mid-drain defeats the "phase 4 always runs" guarantee (seen Jun-2 11:57, killed ~170ms into phase 3).
Evidence gap: the reported Jun-4 incident is NOT in this machine's logs (installed app didn't run Jun-4; port 8742 refused; screenshot's Jun-3 09:50 also in a 27h log gap) → the call ran on a different machine/instance; specific trigger needs that machine's engine.log+electron.log+sessions/<id>.json.
Proposed fix order: (1) surface consecutive-null polls as connection-lost banner in polling.js; (2) split liveness recovery from memory-pressure recovery so a dead/hung engine restarts even mid-call; (3) hard-timeout drain phase-3 LLM calls; (4) defer token-refresh restart until idle; (5) verify capture device at record-start.