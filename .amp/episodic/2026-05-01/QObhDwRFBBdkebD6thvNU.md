---
id: QObhDwRFBBdkebD6thvNU
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.4 Dispatch B complete — single-pass typed visitor
outcome: approved
created_at: "2026-05-01T20:57:14.630Z"
---

[project:fugazi] Phase 3c.4 Dispatch B landed at 344467a on branch phase-3-foundation. Single-pass typed visitor at packages/extract/src/visitor/{types,index,declarations,imports,usages}.ts. 363 LOC implementation + 46 LOC types = 409 total, well under the 700 budget. One walk() call across all visitor source files. Replaces the original Fallow Rust pipeline's 4-pass INSTANCE_EXPORT_SENTINEL approach (per IMP-PERF-06 + IMP-DEBT-08).

Inventory shape (frozen on emit, sorted by range.start.byteOffset then name):
- declarations[] — { kind: 'function'|'class'|'variable'|'type'|'enum', name, exported, range, members }
- imports[] — { kind: 'static'|'dynamic'|'reexport', source, resolvable, range }
- usages[] — { kind: 'identifier'|'jsx'|'member'|'decorator', name, range }

Key design decisions:
- Export-flagging strategy: extended ExportDecl with optional `declaration?: Statement` field. SWC adapter populates from ExportDeclaration.declaration and ExportDefaultDeclaration.decl (FunctionExpression / ClassExpression / TsInterfaceDeclaration). Walker descends via exportChildren when present. Visitor reads parent.kind === 'ExportDecl' to flag exported: true. No parent stack, no second pass — pure structural.
- Empty-name destructuring slots (e.g. `const { a, b } = obj` where the parser collapses to declarators with `name: ''`) are skipped from output rather than emitted with empty names.
- JSX member-form `<Foo.Bar/>` collapses to JSXElement{name:''} at the parser level (kinds.ts line ~196) — visitor still emits `{kind:'jsx', name:''}` since the parser-level decision is upstream.
- Anonymous `export default 42` (ExportDefaultExpression with no `declaration`) emits no Declaration. The export edge IS detected by imports.ts as a re-export only when source!==null; bare `export default expr` produces nothing inventory-relevant.
- Bare specifier `export { x };` (no `from`, no wrapped decl) does NOT retroactively flag a prior declaration as exported. Documented limitation in visitor/index.ts leading comment. Out of scope for single-pass discipline; revisit if downstream analyses need it (would require either two-pass or a deferred-resolution table).
- Identifier role disambiguation (binding vs usage) uses parent inspection inside onNode: skip when parent is FunctionDecl params, VariableDecl declarators (handled separately), ClassDecl members or decorators, or MemberExpression.property slot.

Tests: 33 in visitor.test.ts. 3 structural — single-pass counter (onEnter count == childrenOf-recursion baseline), no INSTANCE_EXPORT_SENTINEL in src files, byte-equal JSON.stringify across two consecutive runs on 3 representative fixtures. 30 input-source fixtures distributed across top-level/nested decls (4+2), exports (4), re-exports (3), default/named/namespace imports (3), type-only imports (2), dynamic imports literal+template+variable (3), JSX intrinsic+component+member (3), enum+class members (2), bare+called decorators (2), destructuring+computed names no-throw (2).

Repo gates as of 344467a: build (forced), typecheck (forced 19/19), lint (forced 11/11), test 485+5 skipped, forbidden-strings, forbidden-fallow-env, verify-wasm — all exit 0. Phase 3c milestone "advisor decision point 3" from docs/superpowers/plans/00-overview.md is GREEN: parser passes WASM-integrity, the typed visitor produces deterministic Inventory across runs, no sentinels, single AST traversal.

Next dispatch is Phase 3c.4 Dispatch C (T065-test + T066 + T067-test): dynamic `import()` already partially handled by imports.ts (kind:'dynamic'). Remaining work — `new URL('./x', import.meta.url)` asset-edge pattern detection (likely `packages/extract/src/asset-url.ts` + `packages/extract/src/visitor/dynamic.ts`), template-literal constant-prefix extraction, and 15 fast-check property invariants for the visitor (visitor-properties.test.ts). Spec: docs/superpowers/plans/02-phase-3c-3d-3e.md lines ~567-608. Working tree clean as of 344467a.