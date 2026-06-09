---
id: oaSLuQ5aDAqzMmAIQUQLe
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Fixed two pipeline bugs: probing not_applicable overwrite + null list validation
outcome: approved
created_at: "2026-04-01T17:09:09.434Z"
---

[project:agent-assist-cr] Two bugs found and fixed:

1. PROBING NOT_APPLICABLE OVERWRITE BUG: When a probing question was marked CONDITIONAL_HIDDEN (not_applicable) on an early chunk before the info was available, it could never be promoted back to AUTO_DETECTED when the customer later provided the answer. Root cause: _apply_probing_answers in pipeline_applicator.py set CONDITIONAL_HIDDEN without checking if the item was already answered. Fix: answers always take priority over hidden status; hidden never downgrades an existing answer. Also tightened probing_matcher.py prompt to restrict not_applicable to ONLY equipment-type physical impossibilities (e.g., gas/oil question on AC unit), with explicit examples of what should go to unmatched_questions instead.

2. NULL LIST VALIDATION BUG: LLM sometimes returns null instead of [] for List fields in structured output (safety_concerns, symptoms, conversation_qa, additional_procedures, matched_answers, unmatched_questions, additional_info). This caused pydantic validation to crash with 'Input should be a valid array'. Fix: Added field_validator(mode='before') to coerce null to empty list on all List fields in ConversationFacts, SopMatchResult, and ProbingMatchResult models.

Both bugs confirmed fixed: full transcript test shows 5/6 probing matched (hvac_mb_03 correctly unmatched, not not_applicable), no validation crashes.