---
id: zGGqvW0269nPRUU-1M0V2
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Sentence reunification (3c)
outcome: approved
created_at: "2026-03-28T10:25:20.659Z"
---

[project:cic2] Ported CIC1's _reunite_split_sentences() from merge_pipeline.py to runtime/transcript/sentence_reunifier.py. When a backchannel splits a speaker's sentence into two turns, the short continuation (≤4 words) is merged back into the original turn. Conditions: original must not end with sentence-ending punctuation (.!?) and must have ≥4 words. Looks ahead up to 3 turns for same-speaker continuation. Integrated into PipelineOrchestrator after turn assembly. 7 tests covering: no splits, split sentence merged, complete sentences skipped, short first turn skipped, long continuation skipped.