---
id: ITKldis1WkzYMxWC4l3SV
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Multi-model comparison results — gpt-4o-mini vs gpt-4o vs GLM-5
outcome: approved
created_at: "2026-04-01T09:24:48.615Z"
---

[project:agent-assist-cr] Three-model head-to-head comparison on baseline Blanton HVAC transcript.

Results (1 run each, both pipelines):

gpt-4o-mini (OpenAI, $0.15/$0.60 per 1M tokens):
- Analyzer: 3/3 classification, 4/4 customer info, 6/6 probing, 7.2s
- 3-Stage: 3/3 classification, 4/4 customer info, 5/5 equipment, 6/6 probing, 33.5s

gpt-4o (OpenAI, $2.50/$10.00 per 1M tokens):
- Analyzer: 3/3 classification, 4/4 customer info, 6/6 probing, 5.9s
- 3-Stage: 3/3 classification, 4/4 customer info, 5/5 equipment, 6/6 probing, 17.3s
- Notable: Stage 1 extracted 10 QA pairs (vs 4 for mini) — more thorough extraction
- Faster than gpt-4o-mini on both pipelines despite being a larger model

GLM-5 (OpenRouter, $0.72/$2.30 per 1M tokens):
- Analyzer: FAILED — structured output validation error (double-quoting bug)
- 3-Stage: 3/3 classification (silently defaulted to None), 4/4 customer info, 4/5 equipment, 0/6 probing
- Latency: 18.8s analyzer, 193s 3-stage (extremely slow)

Conclusion: gpt-4o-mini remains the best cost/accuracy option. gpt-4o is faster and slightly more thorough but 16x more expensive. GLM-5 is unusable for structured output.