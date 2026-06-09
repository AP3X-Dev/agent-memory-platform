---
id: yt-uAVV7Nc3lAaiTT7fOO
session_id: session-20260608-ag3ntic-phase45
agent_id: mcp
task: [project:ag3ntic] Record hard safety constraint for the Cerebro deploy (Task 16) authorized by the user.
created_at: "2026-06-08T08:40:42.738Z"
---

CEREBRO DEPLOY SAFETY CONSTRAINT (user-authorized Phase 4 Task 16, but with a hard guardrail). The user authorized me to deploy the morph branch to Cerebro (192.168.0.25) autonomously, BUT only within the isolated `ag3ntic` compose project (~/projects/ag3ntic-morph; host ports web 8095 / api 8096 / minio 9110-9111). DO NOT touch any other Docker compose project, container, volume, or network on Cerebro. MemBerry (Neo4j + Redis + wiki viewer on port 3200) runs on the SAME Docker host and the ENTIRE memory system depends on it — breaking it ruins everything. FORBIDDEN: docker system prune, docker volume/network prune, redis FLUSHALL/FLUSHDB on any shared Redis, restarting the Docker daemon, touching non-ag3ntic containers/compose projects, modifying shared networks/volumes. REQUIRED before deploy: map the existing Docker landscape (docker compose ls / docker ps) via the cerebro skill, confirm the ag3ntic stack has its OWN isolated Redis (the ACP run-bus uses redis.asyncio with keys ag3ntic:run_jobs and run:*:events — verify it points at the ag3ntic Redis, not MemBerry's), and scope every command to the ag3ntic project only. Bias to STOP + report if anything is ambiguous about isolation.