# AMP Shared Memory Layer — Design

**Status:** Approved — building · **Date:** 2026-05-30
**Decisions locked:** scope = foundation + Google Drive connector · permission model =
grant-set intersection · tenant isolation = **Option B first, behind the A-ready
`resolveSession` seam** (see §7).

---

## 0. Goal

Turn AMP from a single-user agent memory engine into a **trusted shared business-context
layer** for SMBs and enterprises — *without changing how AMP works today*. The layer is
**optional and additive**: when it is not configured, AMP behaves exactly as it does now,
with zero added overhead. When it is enabled, every read and write is tenant-scoped,
permission-checked, provenance-tracked, and audited.

### Non-negotiable constraints

1. **Core AMP is untouched in behavior.** No existing test changes meaning. Personal mode
   keeps working with no policy context, no tenant, no connectors.
2. **Secure by construction, not by discipline.** Enforcement lives at the lowest shared
   chokepoint (the query layer), so a *new* read path cannot accidentally leak.
3. **Connector-agnostic permissions.** AMP enforces a simple, uniform model; connectors
   translate their native ACLs into it.

---

## 1. Two states, not four modes

Marketing has four tiers (Personal / Team / Business / Enterprise). The codebase has **two**:

| State | Trigger | Behavior |
|-------|---------|----------|
| **Governance OFF** | No `PolicyContext` supplied (today's calls) | Identical to current AMP. Query predicates are no-ops. |
| **Governance ON** | A `PolicyContext` is supplied | Tenant partition + grant-set filter + audit applied on every path. |

Connectors, PII redaction, admin review queue, and business objects are **modules that plug
into the ON state**. They are not separate codepaths. This keeps the binary clean and the
blast radius small.

---

## 2. Package layout (all new, all optional)

```
packages/
  policy/          @amp/policy        Principal, PolicyContext, grant-set engine, decision logic. Pure, no I/O.
  governance/      @amp/governance    Tenancy provisioning, audit log, review queue, lifecycle/retention, memory-health.
  business/        @amp/business      Business-object schema (Customer, Vendor, Deal, Ticket, SOP, Invoice…), context packs.
  connectors/      @amp/connectors    Connector SDK + interface; the first concrete connector (Slack).
  admin/           @amp/admin         (later) HTTP API + dashboard over governance.
```

Dependency direction (arrows = "depends on"):

```
@amp/policy      ← pure, depends on nothing in AMP
@amp/governance  → @amp/core, @amp/neo4j, @amp/policy
@amp/business    → @amp/core, @amp/neo4j, @amp/policy
@amp/connectors  → @amp/core, @amp/policy, @amp/governance
@amp/mcp         → (optionally wires the above; falls back to plain AMP if absent)
```

`@amp/core`, `@amp/neo4j`, `@amp/retrieval`, `@amp/wiki` gain **only additive extension
points** (§5). They never import the governance packages — the wiring happens in `@amp/mcp`
and the new packages reach *down* into core, never the reverse.

---

## 3. The core abstraction: `PolicyContext`

A single value threaded from the entrypoint (MCP token claims / HTTP session) down to the
query layer. It is the *only* thing the chokepoint needs.

```ts
// @amp/policy
export interface Principal {
  id: string;                  // user or agent id
  kind: 'human' | 'agent' | 'service';
  tenant_id: string;
  roles: string[];             // owner | manager | sales | support | ops | …
  grants: GrantSet;            // capability set this principal holds (see §4)
  delegated_by?: string;       // for agent-acts-as-user tokens
  purpose?: string;            // e.g. "support_reply" — for audit + scoping
}

export interface PolicyContext {
  principal: Principal;
  tenant_id: string;
  workspace_id?: string;
  reason: string;              // recorded in the audit log for every decision
}
```

When `PolicyContext` is `undefined`, every policy function returns "allow / no filter" —
that is what preserves today's behavior.

---

## 4. Permission model — grant-set intersection (decided)

We do **not** mirror Google/Slack/CRM ACLs live (fragile, expensive). Instead:

- At ingest, each connector emits a **normalized grant set** on the memory:
  `acl: ["channel:C123", "group:sales", "user:sarah@acme"]`.
- A principal carries the **grants it holds**: the union of its groups, channels,
  delegated user identity, role grants, etc.
- **Recall keeps a memory iff `memory.acl ∩ principal.grants ≠ ∅`** (empty `acl` = tenant-public).

```ts
// @amp/policy
export type Grant = string;            // opaque, namespaced: "channel:C123", "role:owner"
export type GrantSet = ReadonlySet<Grant>;

export function canRead(acl: GrantSet, held: GrantSet): boolean {
  if (acl.size === 0) return true;     // tenant-public memory
  for (const g of acl) if (held.has(g)) return true;
  return false;
}
```

Why this is the right call now:
- **Connector-agnostic.** Slack maps channels→grants; Drive maps file/folder ACL→grants;
  HubSpot maps team/owner→grants. AMP never learns any connector's permission semantics.
- **Enforceable everywhere cheaply.** Set intersection works identically in Cypher
  (`ANY(g IN node.acl WHERE g IN $held)`), in vector post-filter, and in exports.
- **Upgrade path intact.** "Live ACL mirroring" later becomes: refresh the principal's
  held grant-set at token-mint time from the connector. The enforcement code never changes.

Roles compose in as grants too (`role:owner` etc.), so role-based access is a *subset* of
this model — no separate machinery.

---

## 5. Additive extension points in core (the only core changes)

These are small, optional, and backward-compatible. Each defaults to today's behavior.

### 5.1 Metadata fields (travel through store → graph → recall)

Add **optional** fields. Absent = personal mode.

```ts
// EpisodicNode, SemanticNode, FactNode, MemoryBlock gain:
  tenant_id?: string;
  workspace_id?: string;
  acl?: string[];                 // grant set (§4); empty/absent = tenant-public
  source?: SourceRef;             // provenance (§6)
  review_state?: ReviewState;     // 'verified' | 'inferred' | 'stale' | 'contradicted' | 'needs_review'
  confidence_basis?: string;      // why we believe it
```

`EpisodeInput` / `LoadScope` gain an optional `policy?: PolicyContext` and `tenant_id?`.
None of these are required; existing callers compile and behave unchanged.

### 5.2 The enforcement chokepoint

`ScopedQuery` (and the few direct-driver read paths: `wiki/compile`, provenance traversal,
vector search) accept an optional `PolicyContext`. A single helper builds the predicate:

```ts
// @amp/neo4j — policy-filter.ts
export function policyPredicate(alias: string, pc?: PolicyContext): { cypher: string; params: object } {
  if (!pc) return { cypher: 'true', params: {} };          // OFF → no-op, identical to today
  return {
    cypher: `${alias}.tenant_id = $__tenant
             AND (${alias}.acl IS NULL OR size(${alias}.acl) = 0
                  OR ANY(g IN ${alias}.acl WHERE g IN $__held))`,
    params: { __tenant: pc.tenant_id, __held: [...pc.principal.grants] },
  };
}
```

This predicate is `AND`-ed into **every** read query. A regression test asserts that with a
`PolicyContext` present, no query string is emitted without the `tenant_id` clause — making
"forgot to filter a new path" a test failure, not a breach.

### 5.3 Policy hook before results return

The unified assembler runs one final `filterByPolicy(results, pc)` pass before render — a
belt-and-suspenders check for anything that arrived through fusion/boost paths.

### 5.4 Audit event hooks

`store`, every read entrypoint, and delete/lifecycle ops emit an event to an injected
`AuditSink` (no-op when governance is off). Sink writes append-only to Neo4j (`AuditEvent`
nodes) and/or an external log. Queryable by tenant/admin/principal/time.

---

## 6. Provenance, confidence & freshness

```ts
export interface SourceRef {
  connector: string;             // 'slack' | 'gdrive' | 'manual' | 'agent'
  external_id: string;           // message ts, file id, …
  uri?: string;                  // deep link back to the source
  author?: string;               // who said it
  captured_at: string;
  acl: string[];                 // grant set captured AT INGEST (durable, §4)
}

export type ReviewState = 'verified' | 'inferred' | 'stale' | 'contradicted' | 'needs_review';
```

- **Provenance** reuses AMP's existing `SOURCED_FROM` / `CITES` edges; we add a `Source`
  node per connector item and link memories to it. Every memory answers "where did this come
  from, who said it, when."
- **Freshness** is a function of `source.captured_at` + connector sync time; stale items get
  `review_state: 'stale'` by a scheduled sweep (reuses temporal-decay machinery).
- **Contradiction** reuses AMP's existing contradiction/fact-invalidation path; the SMB
  surface is just a view: "CRM says X, Slack says Y."

---

## 7. Tenant isolation model — DECIDED: B-first, A-ready seam

> **Decision:** Build Option B (shared DB + enforced `tenant_id`) now, behind a
> `resolveSession(pc)` routing seam in `@amp/neo4j` so Option A (DB-per-tenant) becomes a
> drop-in later with no rewrites above the storage layer. Trade-off analysis kept below for
> the record.

This was the **single hardest-to-reverse choice** because it sets the storage topology.

### Option A — Database-per-tenant (Neo4j multi-database)

Each tenant = its own Neo4j database (`amp_tenant_<id>`). Connection routing picks the DB
from `PolicyContext.tenant_id`. Personal mode uses the default `neo4j` DB exactly as today.

| Dimension | Assessment |
|-----------|------------|
| **Leakage blast radius** | **Zero cross-tenant by construction** — a query physically cannot reach another DB. Strongest possible story for SMB trust + compliance. |
| **Enforcement reliance** | Grant-set filter only protects *within* a tenant. Tenant boundary needs no application correctness. |
| **Backup / restore / "forget this tenant"** | Per-tenant — drop one DB to offboard a customer. Clean DR per tenant. |
| **Ops cost** | Higher: provisioning on tenant creation, connection pool per DB, migrations fan out across N DBs, monitoring per DB. Neo4j community edition allows **only one** DB — needs **Enterprise** (or Aura). |
| **Cross-tenant analytics** | Hard (by design). Fine for SMB; a problem only if you ever want global analytics. |
| **Migration of existing data** | None — existing personal data stays in default DB. |

### Option B — Shared DB + enforced `tenant_id` property

One database. `tenant_id` is an indexed property on every node; the §5.2 predicate enforces
it on every query.

| Dimension | Assessment |
|-----------|------------|
| **Leakage blast radius** | Cross-tenant prevented **by the chokepoint**, not by physics. One unfiltered query = potential cross-tenant leak. Mitigated by the "no query without tenant clause" regression test, but it is application-correctness-dependent. |
| **Enforcement reliance** | High — the predicate must be airtight on every path forever. |
| **Backup / restore / "forget this tenant"** | Logical delete by `tenant_id` (cascade). DR is all-or-nothing; per-tenant restore is a query, not a file. |
| **Ops cost** | Low: one DB, one backup, one migration. Works on Neo4j **Community**. |
| **Cross-tenant analytics** | Easy. |
| **Migration of existing data** | Existing personal nodes get no `tenant_id` → treated as the implicit "personal/default" tenant. Backfill optional. |

### Recommendation

**Hybrid, and it costs us nothing to keep both open:** design the storage layer so the
`Neo4jLayer` resolves a **session/database from `PolicyContext`**. Then:

- **Default / Personal / Community Neo4j → Option B** (one DB, `tenant_id` property + enforced
  predicate). This is what we build first, it works on the Neo4j you already run, and it lets
  the foundation + connector ship now.
- **Enterprise Neo4j present → Option A** flips on per-tenant databases via the *same*
  routing seam, with zero changes to the policy/connector/business code above it.

Concretely: introduce `resolveSession(pc?: PolicyContext)` in `@amp/neo4j`. Today it returns
`driver.session()`. Option B sets a `tenant_id` param. Option A later returns
`driver.session({ database: tenantDb(pc) })`. **The decision stops being irreversible** — we
get B's simplicity now and A's hard isolation later without rewrites.

**Please confirm:** ship B-first with the A-ready routing seam (recommended), or commit
hard to A (DB-per-tenant) from day one (needs Neo4j Enterprise/Aura)?

---

## 8. Business object model

First-class typed entities layered on AMP's existing `Entity` node via a `business_type`
property + dedicated labels, so they ride the existing graph, ranking, and wiki for free.

```
Customer · Vendor · Employee · Deal · Ticket · Project · Invoice · SOP
```

- Each is an `Entity` with `business_type` + structured props + `tenant_id` + `acl`.
- Relationships reuse existing typed-edge machinery (`amp_arch_relate`): e.g.
  `(Ticket)-[:ABOUT]->(Customer)`, `(Invoice)-[:ABOUT]->(Customer)`.
- **Context packs** = saved retrieval templates over `amp_context`: "Sales call prep",
  "Client handoff", "New support agent". A pack is `{ name, business_type, query template,
  required grants, render layout }`. Implemented in `@amp/business`, executed through the
  existing assembler with a `PolicyContext`.
- **Role-specific recall** falls out of grants + packs: sales role holds sales grants and
  default-loads the sales packs.

---

## 9. Admin, audit, lifecycle (in `@amp/governance`)

- **Audit log:** append-only `AuditEvent` nodes `{tenant, principal, action, target, reason,
  decision, at}`; queryable. Fed by §5.4 hooks.
- **Admin review queue:** reuses the existing **consolidation proposal** model
  (`ConsolidationProposal` already has `before/after/score/affected_ids`). Inferred
  business-critical facts land as proposals an owner approves/rejects; approval flips
  `review_state` to `verified`.
- **Lifecycle:** retention/expiration via existing `ttl` + a sweep; legal hold = a flag that
  blocks delete; customer offboarding = cascade delete by `tenant_id`/`acl` (or DB drop under
  Option A).
- **Memory health dashboard:** reuses `amp_lint`'s 10 checks, scoped per tenant + adds
  stale-source / risky-permission / high-use views.

---

## 10. Connectors (SDK + first: Slack)

```ts
// @amp/connectors
export interface Connector {
  id: string;
  authenticate(tenant_id: string): Promise<ConnectorAuth>;     // OAuth
  sync(cursor?: string): AsyncIterable<SourceItem>;            // incremental
  toGrants(item: SourceItem): string[];                        // native ACL → grant set (§4)
  toMemory(item: SourceItem): EpisodeInput;                    // → amp_store with source + acl
}
```

**First connector: Google Drive** (decided). Folder/file ACLs map to grants
(`file:<id>`, `folder:<id>`, `domain:acme.com`, `user:sarah@acme.com`), and a Drive MCP
connection is already available in this environment. It exercises the full path: OAuth →
incremental sync (changes feed) → grant mapping → provenance → permission-aware recall.
Slack is the obvious second (channel membership → `channel:Cxxx`) and validates the SDK
generalizes across very different permission models.

Tokens are stored encrypted in `@amp/governance`; **agents never receive raw connector
credentials** — they present an AMP-minted short-lived token whose claims become the
`PolicyContext`.

---

## 11. Agent access (token → PolicyContext)

MCP/HTTP entrypoint validates a token and builds the `PolicyContext`:

- **User-delegated:** "acts as Sarah" → principal.grants = Sarah's grants.
- **Service-agent:** scoped grants (e.g. `role:support`, approved SOP grants).
- **Temporary task token:** time-boxed, narrowed grants (e.g. `customer:acme` for 1h).

The existing MCP tools (`amp_load`, `amp_store`, `amp_context`, …) gain an optional
`PolicyContext` derived from token claims. No token → governance OFF → unchanged.

---

## 12. Phased build plan ("foundation + one connector")

| Phase | Deliverable | Touches | Risk |
|-------|-------------|---------|------|
| **0** | `@amp/policy`: `Principal`, `PolicyContext`, `GrantSet`, `canRead`. Pure + unit-tested. | new pkg | none |
| **1** | Additive optional metadata fields (§5.1) on core types; `resolveSession(pc)` seam in `@amp/neo4j`; `policyPredicate` helper. Regression test: OFF ⇒ byte-identical queries to today. | core, neo4j (additive) | low |
| **2** | Thread `PolicyContext` through `ScopedQuery` + assembler + provenance + wiki/compile + vector. Regression test: ON ⇒ every query carries tenant+grant clause. | neo4j, retrieval, wiki | **medium (the safety-critical phase)** |
| **3** | `@amp/governance`: tenancy provisioning (Option B), `AuditSink` + `AuditEvent`, audit hooks. | new pkg + hooks | low |
| **4** | Provenance (`SourceRef`/`Source` node), `review_state`, freshness sweep. | governance, core | low |
| **5** | `@amp/business`: business-object schema + 2 context packs. | new pkg | low |
| **6** | Review queue over consolidation proposals; lifecycle/offboarding. | governance | medium |
| **7** | `@amp/connectors` SDK + **Slack** connector end-to-end (OAuth → sync → grants → recall). | new pkg | medium-high |
| **8** | (stretch) Minimal `@amp/admin` API + dashboard. | new pkg | medium |

**Gate after Phase 2:** prove governance-OFF parity (full existing test suite green, no
behavior change) *and* governance-ON isolation (cross-tenant/cross-grant recall returns
nothing) before building anything on top.

---

## 13. What protects existing AMP (the safety contract)

1. Every new field is optional; every new param defaults to "off".
2. `policyPredicate(alias, undefined)` returns `true` — OFF is a literal no-op.
3. Governance packages depend on core; **core never imports them**.
4. Two regression tests stand guard: *OFF parity* (queries unchanged) and *ON isolation*
   (no unfiltered query escapes).
5. The full current test suite must stay green at every phase with zero edits to existing
   test expectations.
