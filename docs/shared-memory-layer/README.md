# Shared Memory Layer — Planning

Planning docs for the **optional, additive** layer that turns AMP into a multi-tenant,
permission-aware, provenance-tracked, audited shared-context layer for SMBs/enterprise —
without changing how AMP works today.

- **[DESIGN.md](./DESIGN.md)** — full architecture, decisions, and the phased build plan.

## Decisions locked (2026-05-30)

| Decision | Choice |
|----------|--------|
| Build scope | Foundation + one real connector |
| First connector | Google Drive |
| Permission model | Grant-set intersection (`memory.acl ∩ principal.grants`) |
| Tenant isolation | Option B (shared DB + `tenant_id`) first, behind an A-ready `resolveSession` seam |
| Enforcement | At the Neo4j query chokepoint (not a bypassable facade); OFF = literal no-op |
| Packaging | New optional packages (`@amp/policy`, `@amp/governance`, `@amp/business`, `@amp/connectors`); core never imports them |

## Status

**Planning complete. No implementation started.** Next session begins at Phase 0
(`@amp/policy`) per DESIGN.md §12.
