---
id: suNi_vNQcaG-wSC80MMy1
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Implement DockerStreamDemuxer, demux_docker_stream, and exec_attach in docker_client.py (Task 1 TDD)
outcome: approved
created_at: "2026-06-08T03:52:57.533Z"
---

Added DockerStreamDemuxer (resumable byte-level parser for Docker multiplexed tty=False exec stream), demux_docker_stream (one-shot wrapper), and exec_attach (async bidirectional exec open via docker-py low-level API) to apps/api/platform_core/runtime_orchestrator/docker_client.py. Added struct import at module level. Exported all three in __all__. Test file tests/test_docker_exec_attach.py covers: (1) stdout/stderr demux correctness, (2) worst-case single-byte fragmentation. Both tests PASS. Committed fc0ec32 on morph/m1-data-model.