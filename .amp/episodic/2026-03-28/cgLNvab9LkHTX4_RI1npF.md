---
id: cgLNvab9LkHTX4_RI1npF
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Phone/email validation flags (18a)
outcome: approved
created_at: "2026-03-28T09:30:56.088Z"
---

[project:cic2] Ported CIC1's _validate_phone (exactly 10 digits) and _validate_email (@ with dot in domain) from orchestrator.py to entity_extractor.py. Added _FIELD_VALIDATORS dict mapping field names to validator functions. EntityExtractor._store() now runs field-specific validators before storing — sets valid=0 in SQLite when validation fails. Previously CIC2 always set valid=1. The valid flag is now returned in extraction results for frontend display (18b confidence color coding can use this). 4 new tests added covering valid phone, invalid phone, valid email, and email validation edge cases.