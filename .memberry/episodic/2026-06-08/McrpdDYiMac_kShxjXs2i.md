---
id: McrpdDYiMac_kShxjXs2i
session_id: session-20260607-ag3ntic-acp
agent_id: mcp
task: [project:ag3ntic] LIVE-VALIDATED Hermes 0.14.0 ACP contract + the 60s approval ceiling that redefines the per-tool-approval architecture
created_at: "2026-06-08T03:07:10.121Z"
---

[project:ag3ntic] Ran a live ACP smoke on Cerebro 2026-06-08 against employee-demo-hermes-demo via `docker exec -i <container> hermes acp` (model gpt-5.5 / openai-codex). Transport works end-to-end; full JSON-RPC contract now EMPIRICALLY VALIDATED (was 'assumed' per docs/hermes-contract-findings.md open item #1).

VALIDATED WIRE CONTRACT:
- protocolVersion=1 (int). initialize result camelCase: {agentCapabilities:{loadSession:true, promptCapabilities:{image:true}, sessionCapabilities:{fork:{},list:{},resume:{}}}, agentInfo:{name:hermes-agent,version:0.14.0}, authMethods:[openai-codex, hermes-setup], protocolVersion:1}. No authenticate() call needed (creds preconfigured in container).
- session/new returns {sessionId, models:{availableModels:[...]}} and immediately emits two session/update notifs: kind=available_commands_update and kind=usage_update.
- session/prompt streams session/update notifs. kinds seen: agent_message_chunk (update.content.{text,type}), tool_call (ToolCallStart: toolCallId, kind:execute, title, content[]), tool_call_update (status completed/failed), agent_thought_chunk, plan, usage_update, available_commands_update. Terminal result: {stopReason:"end_turn", usage:{...}}.
- STDOUT carries non-JSON noise at startup ('Browser engine ... not installed') — the ACP client MUST skip non-JSON stdout lines (our acp.py already does).
- request_permission (agent->client REQUEST, observed id=0) params: {sessionId, toolCall:{toolCallId:"perm-check-N", kind:"execute", status:"pending", title:<desc>, content:[{content:{text:"$ <cmd>"}}], rawInput:{command:<cmd>, description:<hermes-classified e.g. 'delete in root path'}}, options:[{optionId:allow_once,kind:allow_once},{optionId:allow_session,kind:allow_always},{optionId:allow_always,kind:allow_always},{optionId:deny,kind:reject_once}]}. Reply: {outcome:{outcome:selected,optionId:<id>}} or {outcome:{outcome:cancelled}}=deny.
- Permission fires for Hermes NATIVE terminal/dangerous-shell commands (terminal_tool + HERMES_INTERACTIVE=1), carrying {command,description}.

CRITICAL FINDING — 60s AUTO-DENY CEILING (empirically confirmed): held the permission unanswered; at EXACTLY 60s Hermes logged 'Permission request timed out' and 'Tool terminal returned error (60.28s): BLOCKED: User denied. Do NOT retry.', force-failed the tool, and finished the turn. Source: acp_adapter/permissions.py make_approval_callback default timeout=60.0, wired with no override at server.py:1187.

IMPACT: the BUILT runtime_adapter/hermes_adapter.py resume design (block the pending_permission Future until a human decides, then reply allow_once) is BROKEN against real Hermes — a human approving after 60s resumes a tool Hermes already gave up on (and told the model 'Do NOT retry'). PRODUCTION APPROVAL PATTERN must be: PDP-decide FAST within 60s — allow->reply allow_once immediately; deny->reply deny; approval_required->reply DENY immediately + park run at waiting_approval (canonical gateway ApprovalRequest+TTL+audit) + on human approve, record a standing grant and RESUME the session + RE-PROMPT so the agent re-attempts; on re-attempt the PDP returns allow->reply allow_once fast->executes. This is the §17.7/§14.5 're-issue after approval' canonical path. Optional UX polish: fast-path hold-and-answer when a human approves within ~50s (live-watching mode), else fall back to deny+park+re-issue.</content>
<tags>["project:ag3ntic", "morph", "permission-gateway", "Hermes", "ApprovalRequest", "backend", "security", "computer-use", "decision"]</tags>
<entities>["Hermes", "PermissionGateway", "ApprovalRequest", "Employee", "RuntimeInstance", "Capability", "Cerebro"]</entities>
<outcome>approved</outcome>
