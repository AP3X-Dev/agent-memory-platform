---
id: LUO3uUcwzjq_QP1sIIS37
session_id: session-20260419-200600
agent_id: mcp
task: [project:ap3x-solana] Task 9 PRP-02: HistoricalSignalSource implementation
outcome: approved
created_at: "2026-04-20T03:07:05.655Z"
---

[project:ap3x-solana] Implemented HistoricalSignalSource in @ap3x/solana-signals (Task 9, PRP-02). Key deviations from template required adapting to actual API shapes: EventDecoderRegistry.decode() takes a TransactionLog (not strings), DecodedEvent has { kind: 'decoded', programId: string, data: TEvent } — no logIndex, no raw field, programId is a string. Signal.raw is a ProgramLogChunk (from solana-events), not a plain object. logIndex for signalId is the DFS position in the events array. The fakeRegistry in tests was rewritten to emit proper DecodedEventStream shape. Both tests pass. Commit SHA: c52e517.