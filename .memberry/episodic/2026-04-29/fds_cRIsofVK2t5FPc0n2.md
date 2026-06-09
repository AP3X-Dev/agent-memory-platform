---
id: fds_cRIsofVK2t5FPc0n2
session_id: session-20260429-backfill
agent_id: mcp
task: [project:agent-assist-cr] Portal integration — real JSON:API shape, OAuth bearer, mid-shift rotation
outcome: approved
created_at: "2026-04-29T12:12:20.292Z"
---

[project:agent-assist-cr] Three-stage portal hookup (2026-04-28 → 29).

Stage 1 (2026-04-28): PortalClient started consuming the real portal's JSON:API response shape (27800bc); agent_id dropped from the outgoing envelope (real portal derives it from auth) and submit-response parsing now tolerates both legacy and JSON:API shapes (a196ee9); Authorization bearer header wired into all PortalClient requests (ce88dbf).

Stage 2 (2026-04-28, c2b297e): full OAuth flow + agent name resolver + boot-time SOP sync wired together. Bearer extraction goes through the desktop OAuth flow + `npm run extract-token` pipeline (NOT Georgi's console — that hits a different DB per project memory). Name resolver computes the on-wire agent_id as `User#agent_tag` formatted as FirstnameL (e.g., 'JohnD').

Stage 3 (2026-04-29, commit 02c8531): mid-shift bearer rotation. Submit retries automatically on 401, fetches a fresh bearer via the rotation hook, and replays the request once. Prevents shift-long sessions from dying silently when the bearer expires mid-call. Recovery is transparent to the renderer; only persistent 401 surfaces as failure.

Constraints honored: no staging environment exists — portal.cicops.ai is prod with 96+ companies (most playbooks empty so playbook fetch returns 500). Portal is the CRM replacement for Zoho; no ServiceTitan push in V1. Companies are referenced by integer id, no slug. All credentials (OpenAI, Deepgram) come from the portal's non-company-scoped startup endpoint as CIC-owned shared keys.