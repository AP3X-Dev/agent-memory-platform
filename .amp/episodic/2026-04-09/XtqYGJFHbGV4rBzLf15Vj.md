---
id: XtqYGJFHbGV4rBzLf15Vj
session_id: amp-opt-S018
agent_id: mcp
task: [project:amp] Item 16 Mode B — Additional dead import cleanup across 3 packages
outcome: approved
created_at: "2026-04-09T12:56:50.664Z"
---

[project:amp] Continued Item 16 dead wire removal in Mode B. Performed systematic scan of all 40+ production source files across 8 packages, cross-referencing every import symbol against in-file usage. Found and removed 3 genuinely dead imports: readFile/stat in code/indexer.ts (only readdir is used, file reading handled by parser.ts), StabilityTier in arch/context.ts (only ArchContext consumed), RetrievalResult in retrieval/deterministic.ts (only ContextSection and ContextItem consumed). Also noted ModelNode in core/types.ts is defined but never referenced — kept as valid future API surface. Confirmed all bootstrap.ts remaining imports are correctly consumed (2+ references each). Branch opt/item-16-remove-dead-wires now has core Item 16 work plus these 3 discovery fixes. 384 tests pass, 0 failures.