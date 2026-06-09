---
id: zGnxphbU4Z0Ejt1btcpW4
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] GLM-5 model evaluation — ruled out for structured output
outcome: rejected
created_at: "2026-04-01T09:24:32.229Z"
---

[project:agent-assist-cr] GLM-5 (z-ai/glm-5 via OpenRouter) evaluated as potential cheaper alternative to gpt-4o-mini for analysis agents.

FINDING: GLM-5 has a JSON serialization bug in function calling — double-quotes enum string values (sends "\"probing\"" instead of "probing"). This causes Pydantic validation failure on all structured output fields that use constrained values.

Detailed results:
- Stage 1 (fact extraction): WORKS — free-form string fields parse correctly. Equipment, customer info, QA pairs all extracted accurately.
- Stage 2 (SOP classification): FAILS — trade, call_type, job_type all return None due to double-quoting validation failure.
- Stage 3 (probing matching): FAILS — 0/6 questions matched. No trade/job_type from Stage 2 means no probing questions loaded.
- Unified analyzer: FAILS — pydantic-ai raises "Exceeded maximum retries for output validation" due to same double-quoting issue on call_phase field.

Attempted fixes:
1. Added Literal type constraints to Pydantic models (enum values in JSON schema) — GLM-5 respects enums in raw HTTP function calling but double-quotes them through pydantic-ai's harness. Made validation stricter, not better.
2. Direct HTTP test showed GLM-5 CAN return correct values with explicit enum constraints, but the values arrive double-quoted through the pydantic-ai/OpenAI SDK pipeline.

Diagnosis: Model-level JSON serialization defect in GLM-5's function calling. Not fixable with prompt engineering or schema changes.

Pricing context: GLM-5 is $0.72/$2.30 per 1M tokens (roughly 5x cheaper than gpt-4o-mini on input). Would have been cost-effective if it worked.

VERDICT: GLM-5 ruled out for any structured output tasks. May work for free-form text generation (Stage 1 fact extraction worked) but not reliable enough for the full pipeline. All prompt/schema changes rolled back to original state.