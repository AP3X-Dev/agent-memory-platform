---
id: Yc15X8mch4GYVYjKV2OYo
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] 6-model comparison: gpt-4o-mini, gpt-5-nano, gpt-4.1-nano, Gemini 2.0 Flash, Qwen3-235B, Llama 4 Scout
outcome: approved
created_at: "2026-04-01T16:30:12.014Z"
---

[project:agent-assist-cr] 6-model head-to-head comparison on baseline Blanton HVAC transcript. 5 OpenRouter candidates tested against gpt-4o-mini (direct OpenAI) baseline.

RESULTS SUMMARY:
- gpt-4o-mini (direct OpenAI): 3/3 cls, 4/4 cust, 6/6 probing on analyzer. Still the accuracy leader.
- gpt-5-nano ($0.05/M): 2/3 cls, missed classification. Very slow (30s analyzer, 137s 3-stage). Disappointing.
- gpt-4.1-nano ($0.10/M): 3/3 cls on analyzer, 1/3 on 3-stage. Fast (3.5s). Inconsistent across pipelines.
- Gemini 2.0 Flash ($0.10/M): 3/3 cls on analyzer, CRASHED on 3-stage (validation error). Fast (3.0s) when it works.
- Qwen3-235B ($0.07/M): 3/3 cls on both pipelines, 5/5 equipment. Most accurate alternative. But slow (68.8s 3-stage) and 1/6 probing.
- Llama 4 Scout ($0.08/M): 3/3 cls on analyzer, 2/3 on 3-stage. Fastest overall (2.7s analyzer, 7.1s 3-stage).

CRITICAL FINDING: All OpenRouter models scored 1/6 on probing via unified analyzer. gpt-4o-mini via direct OpenAI gets 6/6. This consistent 1/6 across all models suggests a harness/routing issue with how pydantic-ai's answered_questions structured output field is handled through the OpenRouter proxy, not a model capability issue. Needs investigation.

Customer info (4/4) is universal — every model extracts it correctly.
Classification is model-dependent — only gpt-4o-mini (direct) and Qwen3-235B got perfect scores on both pipelines.
Equipment facts: Qwen3-235B got 5/5, others got 4/5 (typically missing functional_status or outside_location nuance).

VERDICT: No OpenRouter model matches gpt-4o-mini accuracy + reliability for the full pipeline. The probing score anomaly needs investigation before ruling out OpenRouter entirely. Qwen3-235B shows promise on classification/equipment but is too slow and probing is broken.