---
id: q20JIILag88RWgCL0dXBZ
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: M11 — deployment/install + backup/restore + upgrade for the AG3NTIC morph
outcome: approved
created_at: "2026-06-07T21:17:02.348Z"
---

M11 DONE on branch morph/m1-data-model (commit 7a36a0e, off aa8e555). Delivered:
- infra/docker-compose.yml rebuilt: name `ag3ntic`; services postgres+redis+minio+QDRANT+docker-socket-proxy+api+worker+web(Next.js prod image). Socket-proxy env set to foundation §8.3 matrix: ALLOW POST,CONTAINERS,IMAGES,NETWORKS,VOLUMES,EXEC,INFO (+ALLOW_START/STOP/RESTARTS); DENY SWARM,SECRETS,SYSTEM,PLUGINS,CONFIGS,NODES; everything else 0. (Original had EXEC:0,VOLUMES:0 — flipped to 1 per §8.3.)
- infra/apache-ag3ntic.conf rebuilt: deleted the 4 /api/vnc + /api/terminal ws ProxyPass lines AND the dead /api/events ws line; kept /api + /api/ HTTP proxy (SSE rides plain HTTP via Accept: text/event-stream on /api/v1/* — there is NO top-level /api/events endpoint in the new API); added Next.js upstream ProxyPass / -> 127.0.0.1:3000. Console served at vhost ROOT (Next.js has no basePath; sub-path mount would need next.config basePath — documented, not done to avoid M8 churn).
- scripts/deploy_cerebro_release.py (NEW): SSH release driver; reconcile-safe (core `ag3ntic` project upgrade leaves per-workspace `ag3ntic-ws-<slug>` employee runtimes running; worker reconciles); preflight clean-tree+rollback-point, datastores up, core up --build, reconcile report, health gate (/api/health + /api/health/ready), backup gate; --rollback-to; --dry-run verified.
- scripts/smoke_backup_restore.py (NEW): Postgres (pg_dump -Fc -> disposable restore DB -> table count), MinIO (mc mirror round-trip via minio/mc container), QDRANT (snapshot -> download -> drop -> recover -> point count via curlimages/curl container on ag3ntic_control net). --dry-run verified.
- apps/web/Dockerfile (NEW): 2-stage Next.js prod (build -> next start). No public/ dir (removed that COPY).
- config.py: added qdrant_url/qdrant_api_key; debranded runtime_docker_network default -> "ag3ntic-runtime" (it IS live: tool_capsules/runtime.py:106 reads settings.runtime_docker_network); object_storage_bucket -> "ag3ntic-artifacts". main.py lifespan: _wire_memory_backend() sets QdrantBackend when QDRANT_URL set (soft-fail), else in-memory (tests unaffected).
- cleanliness_gate.ps1 + .sh: added M11 check `vnc-terminal-proxy` (pattern /api/(vnc|terminal), path infra) so the gate now enforces the M11 removal.
- docs: rewrote production-deploy-checklist.md (was full of dead desktop/Vite/viewer/resident + nonexistent scripts), updated operator-recovery-runbook.md (debranded paths/network/bucket + added Qdrant snapshot drill), reconciled docs/BLOCKERS.md (master key replaces VIEWER_TOKEN_SECRET; real scripts; pre-morph integration items flagged not-yet-rescoped). Rewrote .env.example to match Settings.
EVIDENCE: pytest 128 passed; cleanliness_gate (ps1 AND sh) PASS at M12 incl new vnc-terminal-proxy check; rg '/api/(vnc|terminal)' infra/ = 0; both scripts --dry-run clean.
KEY FACTS for later: provision module is platform_core.provision_operator (NOT provision_admin — rename was planned in risk#8 but NOT done). create_employee_from_spec already exists in runtime_orchestrator/service.py (canonical spec->Employee+EmployeeRevision derivation — reuse for Phase C). docs/security.md + docs/deployment-quickstart.md still have desktop-era content (follow-up, not in M11/M12 mandate, don't trip gate).