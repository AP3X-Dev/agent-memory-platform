# Security

MemBerry is a persistent memory system for AI agents. It stores a Neo4j knowledge
graph (episodic memories, semantic knowledge, temporal facts, entities, code
symbols, audit log) with a Redis cache/stream layer, and exposes that graph to
agents over the Model Context Protocol (MCP).

This document describes the supported deployment model, the security controls
that ship in the codebase, how to configure them, and a checklist for operators.
For the full asset/trust-boundary/threat analysis, see
[`THREAT-MODEL.md`](THREAT-MODEL.md).

---

## Supported deployment model

MemBerry is designed and hardened for a **single-operator / single-trusted-host**
deployment:

- The MCP server, Neo4j, and Redis run on one host (typically via the bundled
  `docker-compose.yml`), reachable from the agents the operator controls.
- The MCP HTTP transport binds to `localhost` and is intended to be reached over
  the loopback interface, an SSH tunnel, or a private network you control — **not**
  exposed directly to the public internet.
- Agents authenticate with a Bearer token. Each token can be mapped to a named
  actor for individual revocation.
- All callers are assumed to operate within one trust domain. MemBerry provides
  **project-scope isolation** (logical separation of memories by `project:<name>`
  tag) but **not** hardened multi-tenant isolation between mutually distrusting
  parties (see [Residual risks](#residual-risks) and the threat model).

If you need to share an instance across mutually distrusting tenants, treat that
as out of the current supported model and isolate at the deployment layer
(separate processes, separate Neo4j/Redis instances, network segmentation).

---

## Authentication

The MCP HTTP/SSE transport requires a Bearer token by default. Token resolution
happens at server start in `packages/mcp/src/server.ts` (`startSSE`,
lines ~193-249) with the following precedence:

1. **Single shared token** — if `MEMBERRY_API_TOKEN` is set, that value is the
   token and is mapped to the actor `default`.
2. **Per-actor named tokens** — if `MEMBERRY_API_TOKENS` is set (and even if
   `MEMBERRY_API_TOKEN` is also set), each `name:token` pair maps a distinct
   token to a named actor identity.
3. **Unauthenticated opt-out** — if no token is configured and
   `MEMBERRY_ALLOW_UNAUTHENTICATED=true`, auth is disabled and a startup warning
   is logged. **Development only.**
4. **Generated session token (fallback)** — if no token is configured and the
   opt-out is not set, the server generates a random `randomUUID()` token and
   prints it to stderr on startup. This guarantees the server is never
   accidentally open: a missing config fails closed to a random secret rather
   than to no auth.

Tokens are presented as `Authorization: Bearer <token>`. Matching is done with a
**constant-time comparison** (`timingSafeEqual`, via `actorForToken` in
`server.ts`) to avoid leaking token bytes through response timing. A length check
precedes the comparison (required by `timingSafeEqual`), and only equal-length
candidates are compared.

The single-token mode (`MEMBERRY_API_TOKEN`) is the legacy/simple path. The
named-token mode (`MEMBERRY_API_TOKENS`) is preferred because it supports
**per-actor revocation** without rotating a shared secret for everyone.

### Configuring a single token

```bash
# Generate a high-entropy token (example):
export MEMBERRY_API_TOKEN="$(openssl rand -hex 32)"
```

Agents then send `Authorization: Bearer <that value>`.

### Configuring per-actor named tokens

```bash
# Comma-separated name:token pairs.
export MEMBERRY_API_TOKENS="alice:$(openssl rand -hex 32),ci:$(openssl rand -hex 32)"
```

Each token authenticates as the named actor (`alice`, `ci`, …). The actor name is
the identity surfaced to downstream logic and audit.

### Rotation and revocation

- **Rotate** a token by changing its value in `MEMBERRY_API_TOKEN` /
  `MEMBERRY_API_TOKENS` and restarting the server. Tokens are read once at
  startup, so a restart is required for changes to take effect.
- **Revoke a single actor** by removing that actor's `name:token` pair from
  `MEMBERRY_API_TOKENS` and restarting. Other actors' tokens remain valid — this
  is the main advantage of named tokens over a single shared secret.
- Treat tokens as secrets: store them in your secret manager / environment, never
  commit them. The generated fallback token is printed to stderr — capture it
  from logs only on a trusted host, and prefer setting an explicit token in any
  non-throwaway deployment.

---

## Network exposure

- **Bind address.** The HTTP/SSE transport listens on `http://localhost:<port>`
  (default `3101`, configurable via `PORT` then `MCP_PORT`). It is meant for
  loopback / private-network reach, not direct public exposure.
- **Origin allowlist.** Browser-originating requests are checked against a fixed
  localhost allowlist (`isOriginAllowed` in `server.ts`, lines ~171-191):
  `http(s)://localhost`, `http(s)://127.0.0.1`, `http(s)://[::1]`. Any other
  `Origin` is rejected with `403`, including on the CORS preflight (`OPTIONS`).
  Requests with **no** `Origin` header are allowed, since non-browser MCP clients
  do not send one — those still require a valid Bearer token.
- **CORS.** Responses echo back the specific allowed origin (never `*`) and only
  permit `GET, POST, OPTIONS` with `Content-Type` and `Authorization` headers
  (`setCorsHeaders`).
- **Health endpoints.**
  - `GET /healthz` — **unauthenticated** liveness check. It exposes no secrets:
    service name, transport, session counts, an `auth_required` boolean, and
    uptime. Intended for local service managers (systemd, Docker healthcheck) to
    verify the process is up without reading token files.
  - `GET /readyz` — **authenticated** readiness check (same payload shape,
    `status: "ready"`). Requires a valid Bearer token.
- **Per-session servers.** Each SSE connection and each Streamable-HTTP session
  gets its own `McpServer` instance with a freshly registered, disabled-by-default
  tool set. Sessions are tracked by ID and torn down on close.
- **Graceful shutdown.** On `SIGTERM`/`SIGINT` the server closes active
  transports and the Neo4j/Redis connections within a bounded timeout
  (`MEMBERRY_SHUTDOWN_TIMEOUT_MS`, default 5s) so a restart cannot wedge on a
  hung connection.

---

## Read-only Cypher posture

The `berry_query` tool (admin domain, disabled by default) accepts raw Cypher.
It is defended in depth (`packages/neo4j/src/query.ts`):

**Layer 1 — static validation (`validateReadOnlyCypher`).** Before execution the
query is:

1. Unicode-normalized (NFKC) so compatibility/fullwidth homoglyphs (e.g.
   `ＤＥＬＥＴＥ`) fold to ASCII and cannot slip past keyword checks.
2. Stripped of string literals, line/block comments, and `$param` references so
   keywords inside those constructs do not cause false positives or evasions.
3. Rejected if it contains an embedded `;` (stacked statements), so a read query
   cannot be suffixed with a write.
4. Rejected if it begins with an administrative command (`SHOW`, `USE`).
5. Rejected if it contains any mutating keyword (`CREATE`, `MERGE`, `SET`,
   `DELETE`, `DETACH`, `REMOVE`, `DROP`, `FOREACH`, `LOAD`).
6. Rejected if it `CALL`s a stored procedure. Read-only `CALL { … }` subqueries
   are permitted; `CALL procName(...)` is blocked.

**Layer 2 — server-enforced read transaction (`rawCypher`).** Even if validation
were somehow bypassed, the query runs in a Neo4j session opened with
`defaultAccessMode: neo4j.session.READ`. Neo4j itself rejects any write in a READ
transaction, so `berry_query` can never mutate the graph regardless of the input.

The result set is also capped (`MAX_RAW_CYPHER_LIMIT = 100`) and the query is
wrapped in a bounding `CALL { … } RETURN * LIMIT n`.

**Important scoping caveat:** `berry_query` / `rawCypher` is read-only but is
**not** project-scoped. A caller that has enabled the admin domain can read across
all projects in the graph. It is an administrative/diagnostic tool and is
disabled by default for that reason. See the threat model.

---

## Read-only deployment mode (`MEMBERRY_READONLY`)

Set `MEMBERRY_READONLY=true` to run a strict read-only deployment. Reads and
retrieval continue to work; write paths are rejected:

- `berry_store` throws immediately at the top of `AMPService.store`
  (`packages/core/src/service.ts`).
- All memory-block writes (`insert`, `replace`, `rewrite`, `archive`, and the
  underlying `_persist`) throw via `_assertWritable()` in
  `MemoryBlockService` (`packages/core/src/blocks.ts`), which is constructed with
  the read-only flag in `services-factory.ts`.

This is useful for serving a frozen knowledge base, for read-replica style
deployments, and for limiting blast radius when exposing memory to less-trusted
agents.

---

## Secret redaction (`MEMBERRY_REDACT_ON_INGEST`)

Set `MEMBERRY_REDACT_ON_INGEST=true` to redact common secret shapes from episode
`content` and `task` **before** they are hashed, embedded, or persisted
(`AMPService.store`, gated by `config.redactOnIngest`). Redaction happens at the
ingest boundary so credentials never enter the store — relying only on
export-time redaction would still leave plaintext in Neo4j and in backups.

The pattern set (`packages/core/src/redact.ts`) is deliberately conservative to
avoid mangling legitimate prose, and covers:

- OpenAI-style keys (`sk-…`), AWS access key IDs (`AKIA…`), GitHub tokens
  (`ghp_…`, `gho_…`, `github_pat_…`), Slack tokens (`xox[baprs]-…`), Google API
  keys (`AIza…`), JWTs, and PEM private-key blocks.
- `key = value` assignments whose key name signals a credential
  (`api_key`, `secret`, `token`, `password`, `access_token`, `client_secret`,
  `auth`).
- Passwords embedded in connection-string URLs (`scheme://user:pass@host`).

A **second, independent** redaction pass runs at the graph-export boundary
(`packages/graph/src/allowlist.ts`, used by `GraphSnapshotService`) so that
`berry_graph_report` / `berry_graph_export` never emit secrets even if redaction
was not enabled on ingest. Export also runs through a per-node-type property
allowlist and XSS-escapes values rendered into the interactive HTML map.

Redaction is **best-effort pattern matching**: it raises the bar significantly
but is not a guarantee that no secret can ever be stored. Do not deliberately
feed credentials into memory and rely on redaction to scrub them.

---

## Audit trail

Write activity is recorded in an **append-only** audit log
(`packages/neo4j/src/audit.ts`). Each entry is an `:AuditLog` node
(`actor`, `action`, `scope`, `target_id`, `detail`, `at`) stored in the same
graph so the trail is queryable alongside everything else and survives restarts.

- The store has **no update or delete API** — the trail is append-only by
  construction.
- `append()` is best-effort and never throws into the caller's path: losing an
  audit line must not fail a user operation. Failures are logged to stderr.
- Indexes/constraints for the audit log are created by schema migration
  `0002-audit-log` (`packages/neo4j/src/migrations.ts`): a unique `id`
  constraint plus `(at)`, `(actor)`, and `(scope)` lookup indexes.
- Query the trail via `AuditLogStore.query({ actor?, scope?, action?, limit? })`,
  which runs in a READ session and caps `limit` at 500.

**Current coverage:** the audit append is wired on the `store` path (the
`berry_store` write). Block-level and admin mutations are **not yet** uniformly
audited — see [Residual risks](#residual-risks).

---

## Project-scope isolation

Every memory is scoped to a project tag (`project:<name>`):

- `berry_store` requires a project tag by default. `resolveProjectTag`
  (`packages/core/src/service.ts`) derives it from a `project:` tag or a
  `[project:<name>]` prefix on the task/content, canonicalizes it to lowercase,
  fuzzy-warns on near-duplicate tags (Levenshtein ≤ 2, catches typos that would
  fragment a project), and auto-creates a placeholder project entity on first use.
- If no project tag is present, `store` throws unless
  `MEMBERRY_REQUIRE_PROJECT_TAG=false` is set (kept for backward compatibility).
- Retrieval (`berry_load`) and `berry_grep` filter by the supplied project
  scope/tags, so a correctly-scoped query returns only that project's knowledge.

Project scoping keeps unrelated projects' memories from contaminating each other
within a single trusted deployment. It is advisory: a caller may pass any project
tag. For separation between *mutually distrusting* parties, use tenant mode below.

## Multi-tenant mode (opt-in, enforced)

Set `MEMBERRY_TENANT_TOKENS="acme:tok_acme,globex:tok_globex"` to turn on
multi-tenant mode. Each bearer token then binds its session to a tenant, and the
binding is **enforced at the data layer**, not advisory:

- Every write stamps `tenant_id` (episodes, facts, blocks, consolidated semantics).
- Every read filters by the caller's tenant (`tenantWhere` in
  `packages/neo4j/src/tenant.ts`): semantics, facts, blocks, and grep. A named
  tenant matches strictly; the implicit `default` tenant also matches legacy rows
  with no `tenant_id`, so enabling tenancy needs no data migration.
- The assembled-context cache and store dedup are tenant-namespaced.
- **Default-deny tool surface:** a tenant session is served only tools proven
  tenant-isolated (`TENANT_SAFE_TOOLS`: load/store/grep/memory\_\*/timeline/fact\_diff).
  Raw Cypher (`berry_query`) and the not-yet-tenant-scoped satellite/retrieval
  domains (`berry_context`/`berry_ask`, code/arch/wiki/graph/research) are withheld
  entirely from tenant sessions.

The cross-tenant guarantee ("tenant A never sees tenant B") is covered by an
adversarial integration test (`tenant-isolation.regression.test.ts`).
Single-tenant deployments (no tenant tokens) are unaffected. The admin
`berry_query` path remains read-only and unscoped — keep the `admin` domain
disabled in shared deployments.

---

## Secure defaults checklist (for operators)

- [ ] **Set an explicit token.** Configure `MEMBERRY_API_TOKEN` or
      `MEMBERRY_API_TOKENS` with high-entropy values (e.g. `openssl rand -hex 32`).
      Do not rely on the generated fallback token for anything but a throwaway run.
- [ ] **Never set `MEMBERRY_ALLOW_UNAUTHENTICATED=true`** outside local dev.
- [ ] **Prefer named tokens** (`MEMBERRY_API_TOKENS`) so you can revoke one actor
      without disrupting others.
- [ ] **Do not expose the port publicly.** Keep the server on loopback / a private
      network / behind an SSH tunnel. The origin allowlist and token are defense in
      depth, not a substitute for network controls.
- [ ] **Change default datastore credentials.** Replace the `memberry-local-dev`
      defaults for `NEO4J_PASSWORD` / `REDIS_PASSWORD` (and keep `REDIS_URL` in
      sync) before any real deployment. Keep Neo4j (`7687`) and Redis (`6379`) off
      the public internet.
- [ ] **Turn on ingest redaction** (`MEMBERRY_REDACT_ON_INGEST=true`) when agents
      may handle credentials.
- [ ] **Use read-only mode** (`MEMBERRY_READONLY=true`) for any deployment that
      should only serve, never accept writes.
- [ ] **Keep the admin domain disabled** unless you actively need it.
      `berry_query` reads across all projects.
- [ ] **Constrain ingest paths.** Set `MEMBERRY_INGEST_ALLOW_DIR` to bound where
      `berry_ingest` / `berry_braindump` / `berry_compile` may read and write.
- [ ] **Protect `OPENAI_API_KEY`** and other secrets via your environment / secret
      manager; never commit them. Use `.env.example` as a template, not a place
      for real values.
- [ ] **Run migrations on a trusted deployment.** Schema migrations run at startup;
      ensure the configured Neo4j credentials are correct before first boot.
- [ ] **Review the audit trail periodically** (`AuditLogStore.query` /
      `berry_query` over `:AuditLog`) and ship stderr logs somewhere durable.

---

## Reporting a vulnerability

If you discover a security issue, please report it privately rather than opening a
public issue.

- **Contact:** `security@example.com` _(placeholder — replace with the project's
  real security contact / GitHub Security Advisory link before publication)._
- Please include a description, reproduction steps, affected version/commit, and
  any suggested remediation.
- We aim to acknowledge reports promptly and will coordinate a fix and disclosure
  timeline with you.

Please do not include live credentials or third-party data in your report.
