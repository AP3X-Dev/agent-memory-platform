---
id: WaqtqBfLqT9XQHe0SHssu
session_id: chunk-cleanup-audit-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Audit codebase for leftover chunk-based pipeline references after streaming-only migration
outcome: approved
created_at: "2026-04-08T17:49:35.471Z"
---

[project:agent-assist-cr] Full codebase audit for chunk-pipeline remnants after streaming-only migration. Found extensive stale references in docs (FEATURES.md, README.md, architecture-diagrams.md) describing the old chunk-pair/WAV/Whisper/merger-thread architecture. Dead config: chunk_seconds, silence_threshold, whisper_model defined in config.py but never consumed by engine logic. DualStreamCapture.output_dir parameter is accepted but never used. Session directories are created on disk but serve no purpose. FEATURES.md references deleted files (merge_pipeline.py, hallucination_filter.py, test_merge_pipeline.py, test_transcript_fixes.py) and deleted classes (SpeakerAwareTranscriber). chunk_index field still lives on TranscriptResult and AgentContext models and is used throughout tests and src - this is structural, not dead code, since the streaming pipeline still sets it to -1. Architecture diagrams sections 3, 8, 11, 14, and LLM Call Inventory all describe the old chunk-pair flow.