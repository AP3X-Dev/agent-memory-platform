---
id: SNWytdOQuY85ngX4lVHvK
session_id: probing-not-applicable-fix-2026-04-07
agent_id: mcp
task: [project:agent-assist-cr] Identified regex-heavy areas that should migrate to LLM
created_at: "2026-04-07T21:11:54.026Z"
---

[project:agent-assist-cr] Four areas where hardcoded regex/keyword logic should be replaced with LLM intelligence (future work):

1. **_sop_try_structured_lookup** (api_server.py:191-287) — Dead code now (chat rerouted to /chat endpoint). Delete the function and the /sop-lookup endpoint entirely.

2. **_check_trade_snp** (sop_engine.py:815-851) — Keyword-matches transcript against trade keywords to fire SERVICE NOT PROVIDED alerts with zero LLM confirmation. Edge case: customer mentions "AC" in passing, system fires hard block if client doesn't do HVAC.

3. **Trade hint in extraction pipeline** (extraction_pipeline.py:236-247) — Hardcoded `if "ac" in detected_trade.lower()` decides which CIC rules Stage 2 LLM sees. Wrong guess = LLM gets wrong reference material.

4. **keyword_classify** (analyzer.py:41-119) — Keyword counting generates grounding hints for the analyzer LLM. Wrong hints anchor/bias the LLM result. The prompt says "override if conversation clearly indicates something different" but anchoring still occurs.

Latency vs accuracy tradeoff needs discussion before implementation. Items 2-4 currently run at zero latency; LLM replacement adds 1-2s per call.