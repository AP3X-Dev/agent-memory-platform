---
id: onEm7EDUs_oFXKsrVFPu5
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Feed analysis pipeline classification to SOP engine — implemented
outcome: approved
created_at: "2026-04-01T17:39:46.312Z"
---

[project:agent-assist-cr] Implemented classification feed from analysis pipeline to SOP engine. This was optimization #3 from the roadmap — fixing the pricing tier mismatch where the SOP engine showed non-member pricing for a member customer.

Changes:
1. api_server.py _sop_feed: reads AssistState from _assist_states[recording_session_id] under _assist_lock, passes to analyze_chunk_full
2. sop_engine.py analyze_chunk_full: accepts optional assist_state parameter, calls _apply_classification before LLM runs
3. sop_engine.py _apply_classification: sets membership_tier from customer_info fields (membership_status, is_existing_customer), sets commercial flag from classification.is_commercial, stores pipeline trade and job_type for downstream filtering

Key design decisions:
- Pipeline classification runs BEFORE LLM, so the LLM sees correct context
- keyword-based _detect_membership_from_transcript still runs as fallback but short-circuits if pipeline already set MEMBER
- Uses getattr() for defensive access since assist_state may be None or have different shapes depending on pipeline
- Stores trade/job_type as _pipeline_trade/_pipeline_job_type for future use in SNP and priority filtering