---
id: aE41XX_PL0xwUI1R4_olM
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Yellow validation warning indicator (18c)
outcome: approved
created_at: "2026-03-28T09:55:23.097Z"
---

[project:cic2] Backend: changed _load_entities() in assist_projection.py to include entities with valid=false (was filtering valid=1 only). Added valid flag to entity payload sent to frontend. Frontend: added valid field to CustomerEntity type in assistStore.ts. CustomerInfoCard.tsx now shows amber (#FF9800) 8px warning dot (matching CIC1's .validation-warning) when valid=false, replacing the confidence dot. Shows when phone fails 10-digit check or email fails @ check (validation added in iteration 13).