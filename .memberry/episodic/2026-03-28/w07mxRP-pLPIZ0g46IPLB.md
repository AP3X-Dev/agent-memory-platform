---
id: w07mxRP-pLPIZ0g46IPLB
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Backchannel detection (2b)
outcome: approved
created_at: "2026-03-28T08:20:48.824Z"
---

[project:cic2] Ported CIC1's is_backchannel() classifier from hallucination_filter.py to runtime/transcript/backchannel.py. Detection uses two signals: duration ≤1500ms AND text matching 40+ known filler tokens (yeah, okay, uh huh, etc.). Integrated into TurnAssembler.assemble() — when a different-speaker segment is a backchannel, it's emitted as its own small turn but does NOT reset current-speaker tracking, so the other speaker's turn remains continuous. This matches CIC1's merge pipeline behavior where backchannels don't cause pre-splitting. 36 tests added (33 detection + 3 integration).