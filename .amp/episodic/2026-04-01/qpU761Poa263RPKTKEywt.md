---
id: qpU761Poa263RPKTKEywt
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] MiniMax M2.7 model evaluation — ruled out for structured output
outcome: rejected
created_at: "2026-04-01T16:07:04.166Z"
---

[project:agent-assist-cr] MiniMax M2.7 (minimax/minimax-m2.7 via OpenRouter, $0.30/$1.20 per 1M tokens) evaluated as alternative LLM provider.

FINDING: MiniMax M2.7 does NOT support tool_choice parameter — returns HTTP 404 "No endpoints found that support the provided 'tool_choice' value." This is required by pydantic-ai for forced structured output.

Without tool_choice, the model CAN use function calling (tools) voluntarily — it returned correct trade=HVAC via function call. But job_type was wrong (Demand Service instead of Must Book), and without tool_choice there's no guarantee the model will use function calling at all vs responding with plain text.

VERDICT: Ruled out. pydantic-ai requires tool_choice for reliable structured output. Would need a custom wrapper to parse text responses as fallback, adding complexity with no accuracy guarantee. Same fundamental limitation as the earlier OpenRouter attempts — most non-OpenAI models don't fully support tool_choice.