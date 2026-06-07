---
id: yuRd-6Mq58svEkHsUK3aY
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Hallucination repeat filter (2c)
outcome: approved
created_at: "2026-03-28T09:15:23.622Z"
---

[project:cic2] Ported CIC1's filter_hallucination_repeats() from hallucination_filter.py to runtime/transcript/hallucination_filter.py. Detects when >50% of segments in a Whisper chunk share the same short text (≤3 words), which is a common Whisper artifact on silent/near-silent audio (e.g., many segments all saying "before." or "Thank you."). Removes the repeated segments, keeping non-repeated ones — or just 1 if ALL are repeats. Integrated into WhisperSTTAdapter.transcribe() after per-segment quality filtering. Works on dicts (CIC2 uses TranscriptSegment dataclass, so converts to dicts for the filter then reconciles). 8 tests added.