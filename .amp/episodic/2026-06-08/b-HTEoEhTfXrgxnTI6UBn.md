---
id: b-HTEoEhTfXrgxnTI6UBn
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: M4 partial — build + launch a real Hermes employee runtime on Cerebro (live)
outcome: approved
created_at: "2026-06-08T01:03:32.054Z"
---

M4 launch milestone DONE (live on Cerebro): a real, hardened Nous hermes-agent employee container LAUNCHES and reaches running via the full §5.1 provisioning state machine. First time live M3/Phase-D provisioning actually ran.

Hermes = Nous Research hermes-agent (github.com/nousresearch/hermes-agent), pip `hermes-agent[mcp,acp]==0.14.0`. Built runtimes/hermes-employee/Dockerfile (FROM python:3.11-slim + venv). FIXED its ENTRYPOINT (was ["hermes-acp"] which exits immediately when run detached — no stdin to own) -> CMD ["sleep","infinity"] keep-alive; the docker_exec model execs hermes-acp per ACP session into the live container (commit 4bbc868).

DIGEST PINNING needs a registry (locally-built images have no RepoDigest -> pull_by_digest images.get(image@digest) fails). Stood up registry:2 on Cerebro at 127.0.0.1:5000 (container ag3ntic-registry, restart unless-stopped). Built with --provenance=false (avoid BuildKit manifest-list/attestation digest mess), pushed localhost:5000/ag3ntic-hermes-employee:v1, digest sha256:a06c61318c67bf42a1432a2febcbb2dfd184ce8f35f299bffac56b22e39492a9. pull_by_digest finds it locally (images.get) -> no network pull.

Created employee (create_employee_from_spec, inline docker exec python) emp_8940c6de179980dcb572e6f9 in workspace wsp_65af44e... with runtime.image=localhost:5000/ag3ntic-hermes-employee + that digest. POST /employees/{id}/launch -> HTTP 201 1.5s, status healthy, container employee-demo-hermes-demo, walked provisioning->pulling_images->creating_network->creating_volumes->starting->healthy. Verified: container Up, hermes-acp at /usr/local/bin, Hermes Agent v0.14.0, User=10001:10001 ReadOnly=true CapDrop=[ALL] PidsLimit=512, console shows "Hermes Demo Employee -> running".

REMAINING (task 15, the deep layer, NOT done): employees can't yet RUN TASKS. Needs: (1) implement docker_exec_transport in runtime_adapter/hermes_adapter.py (currently a STUB that raises hermes_acp_docker_exec_unavailable) — bidirectional docker exec stdio stream attach to the container's hermes-acp; (2) register a live run executor via tasks.runs.register_run_executor (only the offline _default_executor is wired) using HermesRuntimeAdapter(docker_exec) bound to the employee container; (3) Hermes MODEL AUTH — the hermes process in the container needs LLM creds (hermes login/config; possibly reuse the codex/ChatGPT auth.json into the container HERMES_HOME, or a model key); (4) validate ACP wire shapes (protocolVersion, initialize/session-new/prompt, session/update, request_permission) against live Hermes. This is a substantial multi-step effort with real live-integration risk.

State: HEAD 4bbc868, NOT pushed. Tests 177 still pass (image/data changes only). Registry + employee + running container persist on Cerebro.