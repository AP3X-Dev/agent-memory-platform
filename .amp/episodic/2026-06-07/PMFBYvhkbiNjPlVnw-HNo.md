---
id: PMFBYvhkbiNjPlVnw-HNo
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Record the live-validated Hermes runtime contract (Phase C).
outcome: approved
created_at: "2026-06-07T14:06:36.651Z"
---

HERMES CONTRACT — VALIDATED LIVE (2026-06-07, probed pinned cloud-computer/hermes-agent:latest on Cerebro 192.168.0.25, package hermes-agent==0.14.0). Full findings: platform/docs/hermes-contract-findings.md.

HEADLINE: The assumed /v1/runs gateway does NOT exist. Hermes 0.14.0 is a self-contained CLI agent ("the self-improving AI agent"), not a service you POST runs to. grep for /v1/runs across the package = nothing. The only /v1/chat/completions refs are Hermes as a CLIENT to LLM providers + its own `hermes proxy` (OpenAI-compatible credential proxy). The foundation/PRP "/v1/runs + :8642 employee gateway + /v1/chat/completions fallback" model is wrong for Hermes.

REAL SURFACES: (1) ACP = Agent Client Protocol via `hermes acp`/`hermes-acp` — JSON-RPC over stdio (stdout=protocol, stderr=logs), local-trust threat model. acp_adapter pkg handles initialize/session.new/session.prompt/session.cancel/session.load/session.resume, streams session/update, uses AgentCapabilities/PromptCapabilities(image)/SessionCapabilities. **Its request_permission flow (allow_once/allow_session/allow_always/deny) maps DIRECTLY onto AG3NTIC ApprovalRequest/ApprovalDecision** — strongest argument ACP is the M4 substrate. (2) `hermes chat -q "<prompt>" -Q [--resume SID] [--max-turns]` = one-shot programmatic, final answer on stdout (MVP fallback). (3) `hermes mcp serve` = Hermes AS an MCP server; `hermes mcp add` = how AG3NTIC Capabilities (MCP containers) attach to an employee. (4) `hermes dashboard` (FastAPI :9119, mgmt /api/* only — sessions/config/model/cron; fastapi NOT installed in image). (5) `hermes proxy start`, `hermes gateway` (Slack/WhatsApp).

M4 RECOMMENDATION: EmployeeRuntimeAdapter = ACP-stdio primary (orchestrator owns stdio channel, bridges stdio<->SSE; intercepts request_permission at the Permission Gateway), fallback = `hermes chat -q` one-shot. NOT the dashboard /api. Capabilities via `hermes mcp add`.

NOT DONE (needs human-authorized session, no LLM creds used): end-to-end ACP smoke (initialize->session/new->session/prompt->session/update) to capture exact JSON-RPC wire shapes + protocolVersion. Probe scripts kept at platform/scripts/hermes_probe*.sh.