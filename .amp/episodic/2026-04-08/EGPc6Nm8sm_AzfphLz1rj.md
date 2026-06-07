---
id: EGPc6Nm8sm_AzfphLz1rj
session_id: dead-code-audit-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Dead code audit across config, API endpoints, models, and exceptions
created_at: "2026-04-08T17:50:53.705Z"
---

[project:agent-assist-cr] Dead code audit findings:

CONFIG: channels field unused (never read outside definition). chunk_seconds and silence_threshold only exposed in settings GET/PUT, never used for actual processing (chunk pipeline removed). whisper_model only exposed in settings, never used for STT (DeepGram replaced Whisper). skills_dir set but never read. deepgram_model allowlist in _MODEL_ALLOWLISTS is unreachable because deepgram_model is not in _SETTINGS_FIELDS.

API ENDPOINTS: 4 endpoints with no frontend callers: /transcripts/streaming, /transcripts/conversation, /streams/customer, /streams/agent, DELETE /sop/session/{id}. The first 4 are debug/utility endpoints, the DELETE is only used in tests.

MODELS: ServiceRequest class and ClassificationResult.services_requested field never populated. ClassificationResult.disposition field never set beyond default. SpellingState enum and CustomerField.spelling_state never read/set. AgentContext fields agent_stream, current_trade, current_job_type, current_customer_info, current_checklist never read (chunk_index and analysis_count set but not read by analyzer). CustomerInfo.get_completion_summary() and get_all_fields() never called. ChecklistSection.completion_count, is_complete, ChecklistState.overall_completion, completion_percentage never called.

EXCEPTIONS: SkillError, ClassificationError, AnalyzerError, ChecklistError all unused — only defined and re-exported.

COST TRACKER: record_whisper() never called (Whisper STT removed), entire whisper cost tracking path is dead.