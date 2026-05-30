---
id: 8ySXWTd4XQ5NrRFfqEAgH
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Unified analyzer vs 3-stage extraction pipeline accuracy comparison
created_at: "2026-04-01T07:46:35.810Z"
---

[project:agent-assist-cr] Head-to-head comparison: Unified Analyzer (Pipeline A) vs 3-Stage Extraction (Pipeline B) on baseline Blanton HVAC call transcript. 3 runs, gpt-4o-mini model.

Results:
- Classification: BOTH 100% (trade, job_type, call_type) across all runs
- Customer Info: BOTH 100% (name, address, city, zip) across all runs
- Equipment Facts: BOTH 100% (type, age, locations, functional status) across all runs
- Probing Questions: Pipeline B 100% consistent. Pipeline A 94% avg (missed hvac_mb_04 outside location in 1 of 3 runs — 83% min, 100% max)
- Latency: Pipeline A avg 10.1s (1 LLM call). Pipeline B avg 25.1s (3 LLM calls). Pipeline B is ~2.5x slower.

Key takeaway: Both pipelines achieve near-identical accuracy on this baseline. The 3-stage pipeline is more consistent on probing questions (100% vs 94%) but 2.5x slower and 3x the API cost. The unified analyzer occasionally misses a probing answer but nails everything else.

The 3-stage pipeline's advantages not captured in scoring: structured Q&A extraction, SOP rule matching with reasoning chains, safety concerns tracking, SNP blocking, escalation detection. These are governance features that matter for compliance but don't show up in basic accuracy metrics.

Decision needed: Is the probing consistency improvement + governance features worth the 2.5x latency and 3x cost?