---
id: 2xo-ERHgVnGZ2uXbYfmmM
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: M4 complete (MVP) — Hermes employee runs tasks end-to-end on the ChatGPT subscription
outcome: approved
created_at: "2026-06-08T01:27:19.209Z"
---

M4 FUNCTIONALLY DONE (MVP) live on Cerebro: an AG3NTIC employee runs real tasks end-to-end. Verified: POST /api/v1/workspaces/{ws}/runs {employee_id, prompt:"17*23?"} -> run succeeded, output.message contains "17 multiplied by 23 is 391." (correct), HTTP 201 20.9s. Full golden path real: connect -> Operator(ChatGPT/codex) -> propose -> accept -> Employee -> launch -> run task -> real Nous Hermes agent answer via the user's ChatGPT subscription.

HOW: 
- Hermes model auth: `hermes auth add openai-codex --type oauth --no-browser` in the employee container (device flow, user authorized) -> "Added openai-codex OAuth credential". Then `hermes config set model.provider openai-codex` + `hermes config set model.default gpt-5.5` (config at /home/hermes/.hermes/config.yaml). NOTE: `hermes login` is DEPRECATED -> use `hermes auth add <provider> --type oauth`. Providers: nous|openai-codex|xai-oauth. openai-codex = the ChatGPT/codex subscription (same as the Operator). Verified with `hermes chat -q "..." -Q` -> real LLM answer.
- Live run executor (commit 193780d): added docker_client.exec_output(container, argv, timeout) -> (exit_code, stdout, stderr) via docker-py container.exec_run(demux=True) through the EXEC-permitted socket-proxy. Added tasks/runs.py hermes_run_executor: resolves the employee's healthy RuntimeInstance, execs `hermes chat -q <prompt> -Q` in its container, records the answer as run output + run_events, drives queued->running->succeeded. Falls back to _default_executor when no healthy runtime (preserves the offline gateway/approval path). Registered in main.py lifespan via register_run_executor. _run_prompt reads run.input prompt/message/instructions. Tests 177 pass (fallback preserves offline behavior).

USED CHAT-EXEC (not the full ACP transport): docker_exec_transport (hermes_adapter.py) is still a STUB. The MVP executor uses `hermes chat -q` (one-shot) instead of the ACP streaming/permission path. So per-tool Permission-Gateway approvals do NOT gate live hermes runs yet (the agent runs autonomously in its sandboxed container); streaming run-events are coarse. The full ACP docker_exec transport (bidirectional docker exec socket demux -> AcpReader/AcpWriter, streaming session/update + request_permission->approvals) is the richer FOLLOW-UP.

KNOWN FOLLOW-UPS: (1) output noise — `hermes chat` prints "Browser engine (Chromium...) is not installed" on stdout before the answer; strip those known noise lines in hermes_run_executor for clean output. (2) Full ACP transport (streaming + per-tool approvals). (3) Runs are SYNCHRONOUS (block the API request up to 240s); move to async/worker. (4) Capabilities/MCP tools not attached (hermes mcp add = M5). (5) docker CLI not needed (used docker-py exec_run).

STATE: HEAD 193780d, NOT pushed. Cerebro: registry ag3ntic-registry (127.0.0.1:5000), image localhost:5000/ag3ntic-hermes-employee@sha256:a06c613..., employee emp_8940c6de... ("Hermes Demo Employee") running (container employee-demo-hermes-demo, hardened, hermes authed to openai-codex). Nimbus still untouched.