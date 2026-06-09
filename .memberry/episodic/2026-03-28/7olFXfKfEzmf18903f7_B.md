---
id: 7olFXfKfEzmf18903f7_B
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Cross-chunk suffix-prefix overlap trimming (3a)
outcome: approved
created_at: "2026-03-28T09:25:34.653Z"
---

[project:cic2] Ported CIC1's _trim_suffix_prefix_overlap from merge_pipeline.py to runtime/transcript/overlap_trimmer.py. When Whisper transcribes overlapping text at chunk boundaries (sentence spans 15s chunk), detects suffix-prefix word overlap using normalized matching (lowercase, punctuation stripped) between consecutive same-source segments with adjacent chunk indices. Trims the overlapping prefix from the later segment with proportional timestamp adjustment. Drops entire segments that are complete duplicates. Integrated into PipelineOrchestrator between segment retrieval and turn assembly. 9 tests added covering: no overlap, suffix-prefix trim, case-insensitive matching, entire duplicate dropping, different sources, non-adjacent chunks, punctuation normalization.