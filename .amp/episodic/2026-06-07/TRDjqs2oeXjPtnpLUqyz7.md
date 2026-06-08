---
id: TRDjqs2oeXjPtnpLUqyz7
session_id: session-20260607-ag3ntic-prpv2
agent_id: mcp
task: Record the AG3NTIC dual delivery / business-model decision.
outcome: approved
created_at: "2026-06-07T12:11:37.783Z"
---

AG3NTIC business-model decision (Cody Houser / Guerrilla Media 702): AG3NTIC supports TWO delivery models on ONE platform/codebase, not mutually exclusive: (1) self-serve/PLG — customer uses the Operator UI to build & manage their own AI employees (lower price); (2) managed / done-for-you / agency — Guerrilla Media operates the Operator inside the client's workspace, builds & manages employees for them (setup + management fee, higher margin). Same tooling (Operator, EmployeeSpec, capabilities, approvals); the only difference is who sits in the admin seat. This maps to PRP v2 primitives already present: Agency Operator persona (admin across multiple workspaces), multi-tenant workspaces (one per client), cross-workspace template/employee duplication (agency replication), and usage metering (basis for per-workspace plans). Billing/plans remains FUTURE (§32) but the multi-tenant + agency primitives that enable it are in the MVP architecture. This dual model is a strong argument FOR morphing the existing cloud-computer infra (which is cloud, multi-tenant, vault-secured, remotely managed on Cerebro) rather than building from scratch or going on-premise — it removes the "SSH into the client's hardware" pain and makes operating many client workspaces from one control plane cheap. Decision: morph the infra, build AG3NTIC employee/operator/capability/memory/approval layer on top, ship both self-serve and managed.