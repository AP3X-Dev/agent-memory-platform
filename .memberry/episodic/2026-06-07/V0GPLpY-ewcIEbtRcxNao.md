---
id: V0GPLpY-ewcIEbtRcxNao
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Deploy AG3NTIC morph stack on Cerebro Docker alongside Nimbus without breaking anything
outcome: approved
created_at: "2026-06-07T22:49:11.900Z"
---

DEPLOYED AG3NTIC on Cerebro (192.168.0.25) live, isolated, Nimbus untouched.

ISOLATION: compose project `ag3ntic` (vs Nimbus `cloud-computer-platform`), separate networks (ag3ntic_control + ag3ntic-runtime), separate volumes (ag3ntic_*), code at ~/projects/ag3ntic-morph (transferred via tar-over-ssh, 4.6M, no node_modules/.git). REMAPPED host ports to avoid clashes: web 8095->3000, api 8096->8000, minio 9110->9000 / 9111->9001 (Nimbus holds 8000/3000/9100/9101 — verified still UP, all 7 containers, original uptimes, untouched). Set via shell env exports at `docker compose up` (interpolation .env is read from infra/ dir, NOT cwd — so export the vars or they default).

ACCESS: console http://192.168.0.25:8095 → connect page → Control plane URL = `http://api:8000` (internal compose DNS; the prefilled http://localhost:8000 does NOT work from inside the web container) + API key. Provisioned key for guerrillamedia702@gmail.com / workspace "Demo" (wsp_65af44e194692baac5f5efae): ck_c80bacd6... (re-provision with: docker exec ag3ntic-api-1 python -m platform_core.provision_operator --email <e> --workspace-name <w> --key-name <k> --json). Login verified end-to-end (POST /api/session base=http://api:8000 -> {ok:true}). api health/ready = ok (database+redis ok).

CONFIG: ~/projects/ag3ntic-morph/.env: APP_ENV=development, generated AG3NTIC_MASTER_KEY, QDRANT_URL=http://qdrant:6333, DATABASE_URL=postgres platform:platform@postgres/platform, the port vars. Manage: cd ~/projects/ag3ntic-morph && export AG3NTIC_WEB_PORT=8095 AG3NTIC_API_PORT=8096 AG3NTIC_MINIO_PORT=9110 AG3NTIC_MINIO_CONSOLE_PORT=9111 && docker compose -f infra/docker-compose.yml {ps|logs|down|up -d}.

4 REAL DEPLOY BUGS found+fixed (local tests missed them — tests run from the repo, NOT the container layout). New commits on morph/m1-data-model (NOT pushed): 1a5c887 configurable host ports; 03190a9 web image resolve deps fresh per-platform (host Windows package-lock.json pinned wrong-OS lightningcss/tailwind-oxide → next build failed on linux; fix: COPY package.json only + .dockerignore package-lock.json); 5bc843e spec.py _REPO_ROOT=parents[4] → IndexError in container where /app==apps/api (fix: search upward for packages/manifests, graceful fallback; load_json_schema is lazy/not on runtime path); 9344054 provision_operator pre-M1 schema (User(role=) + Workspace(owner_user_id=) + status=="deleted" all invalid → fixed: User has no role, role lives on workspace_members, Workspace has no owner_user_id/status, deletion via deleted_at).

LEARNINGS: (1) deploy reveals layout/cross-platform bugs unit tests can't (container /app==apps/api vs repo platform/apps/api; Windows-vs-Linux native npm binaries). (2) docker compose interpolation .env is read from the compose-file's dir (infra/) by default — export interpolation vars or use --project-directory. (3) connect page base must be the internal http://api:8000, not the prefilled localhost. NOT-DONE/known: qdrant client 1.18 vs server 1.12.4 version-warning (non-fatal, memory backend fails soft to in-memory); employee LAUNCH won't work (no Hermes image); Operator propose needs a real model API key (NO_MODEL_PROVIDER gate). docs/MORPH-BLOCKERS.md unchanged for these (deploy-specific). HEAD 9344054.