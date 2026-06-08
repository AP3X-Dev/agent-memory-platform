---
id: QlP6LVZ-SkYYT43y2p9iS
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Task 3: wire docker_exec ACP transport in hermes_adapter.py (replace M4 stub)
outcome: approved
created_at: "2026-06-08T04:09:57.373Z"
---

Replaced the docker_exec_transport stub (was raising hermes_acp_docker_exec_unavailable) with real wiring: validates container_name present (raises hermes_acp_no_container if missing), calls docker_client.exec_attach(container_name, ["hermes", "acp"]), wraps result in DockerAcpTransport, returns (reader, writer). Created tests/test_docker_exec_transport_wired.py asserting the new error code, confirming stub is gone. Both test files (6 tests total) pass. Committed f15c983 on morph/m1-data-model.