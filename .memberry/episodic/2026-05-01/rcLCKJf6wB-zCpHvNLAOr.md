---
id: rcLCKJf6wB-zCpHvNLAOr
session_id: session-20260501-resume
agent_id: mcp
task: [project:agent-assist-cr] Decision: ScrubFilter PII scope is appropriate as-is. No code or runbook changes for the demo or soft launch.
outcome: approved
created_at: "2026-05-01T17:11:46.695Z"
---

[project:agent-assist-cr] Decision on 2026-05-01: leave ScrubFilter scoped to API-key-shaped strings only. No expansion to redact customer PII (names/phones/emails/addresses). No two-tier logging. No support runbook line.

Rationale (user-articulated):

1. Customer info in rescue files is INTENTIONAL, not a leak. When a call submission fails, the rescue layer at <data_dir>/pending-recovery/<ISO>_<submission_id>.json retains the full envelope including customer info — that's the whole point of the recovery layer. Redacting customer info in logs while keeping it in rescue files is incoherent.

2. API keys are portal-served at app startup, not in-process secrets. The OpenAI/Deepgram credentials come from a non-company-scoped portal endpoint (per project_shared_ai_credentials memory). The api-key-shaped redaction the ScrubFilter already does covers the only sensitive material that could legitimately leak through logs.

3. The two-tier-logs option (B) and aggressive-scrub option (A) from the handoff plan are over-engineered for the actual risk surface. Don't ship them.

Implication for support workflow: when shipping a log bundle off the agent's machine, the customer-info-in-logs is treated the same as customer-info-in-rescue-files — it's expected, not a leak. The /logs/bundle handler at src/electron/main.js can ship without manual review.

This decision should not be revisited unless the threat model changes (e.g., logs become accessible to a third-party SaaS, or PCI/HIPAA/PHI requirements arrive).