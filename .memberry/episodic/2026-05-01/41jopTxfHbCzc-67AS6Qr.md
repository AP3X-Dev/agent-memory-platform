---
id: 41jopTxfHbCzc-67AS6Qr
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.4 Dispatch C-2 complete — visitor property invariants + type-only imports
outcome: approved
created_at: "2026-05-01T22:00:31.303Z"
---

[project:fugazi] Phase 3c.4 Dispatch C-2 landed at daf0e7e on branch phase-3-foundation. 15 fast-check property invariants for the visitor pipeline + a type-only-import production extension that closes the spec gap from T067-test property #7.

Production extension — type-only imports:
- ImportKind union now includes 'type' (alongside 'static' | 'dynamic' | 'reexport' | 'asset').
- ImportDecl extended with optional typeOnly?: boolean.
- parsers/oxc.ts classifyImport reads SWC's declaration-level `typeOnly` AND per-specifier `isTypeOnly` flags. POLICY: typeOnly = true ONLY when EITHER (a) the declaration is `import type {...}` OR (b) every specifier has isTypeOnly: true. Mixed imports (`import { Foo, type Bar }`) stay typeOnly: false. The policy is documented in visitor/imports.ts file header.
- visitor/imports.ts handleStaticImport now switches on node.typeOnly and emits kind: 'type' or 'static' accordingly.

Two existing visitor.test.ts fixtures flipped: `import type { X } from './m'` and `import { type Y } from './m'` now expect kind: 'type'. New fixture added: `import { Foo, type Bar } from './m'` stays kind: 'static' (mixed-import policy assertion).

Property invariants (15 in visitor-properties.test.ts; numRuns 100-200 each; wall-clock ~13s):
1. visitor terminates on every well-formed structured input
2. all declarations have non-empty names
3. side-effect imports (no bindings) still emit a static Import edge
4. inventory order stable across two consecutive buildInventory calls on same Program reference
5. identifier and member usages have non-empty names (jsx can be empty for member-form `<Foo.Bar/>`)
6. JSX usages appear in usages[] when fixture has JSX
7. type-only imports emit kind:'type' (3 sub-properties: declaration-level, all-specifiers, mixed-stays-static)
8. re-exports emit kind:'reexport' (2 sub-properties)
9. namespace imports emit kind:'static' Import edge
10. BOM input produces structurally-equal Inventory (ranges shift by BOM byte width; structure verified excluding ranges)
11. visitor idempotent on fixed Program reference
12. cache layer — out of scope (it.skip with explanation; cache integration belongs to cache-roundtrip.test.ts)
13. non-ASCII identifiers parse, visit, round-trip verbatim (REFRAMED: `function élé() { élé(); }` because walker doesn't descend into declarator init slots)
14. shebang-prefixed sources parse and visit without throwing
15. output collections sorted by range.start.byteOffset then name (or source for imports)

devDeps added: @fast-check/vitest@0.1.3 + fast-check@^4.7.0 in packages/extract (matches packages/config pin to avoid version drift).

Phase 3c.4 advisor gate (decision point 3 from docs/superpowers/plans/00-overview.md): GREEN. Typed visitor produces deterministic Inventory across runs; no INSTANCE_EXPORT_SENTINEL anywhere; single AST traversal verified via counter; LOC budget ≤ 700 honoured.

Repo total: 544 active + 6 skipped (was 500 + 5; gained 44 property tests + 1 documented skip). Build / typecheck (forced fresh) / lint (forced fresh) / test / forbidden-strings / forbidden-fallow-env / verify-wasm all exit 0.

CARRIED FORWARD: walker still does not descend into VariableDecl declarator init slots. Two known unreachable patterns: asset-URL inside `const u = new URL(...)` and any expression-shape inside `const x = expr`. Visitor.test.ts fixtures use top-level expression statements as a workaround. Mitigation deferred to a later wave (visitor pre-scan over onNode VariableDecl is the lightest path).

Next dispatch is Phase 3c.5 (SFC handlers, T068..T074): Vue (T068/T069 with @vue/compiler-sfc, 12 fixtures, scoped CSS class extraction), Svelte (T070/T071 with Svelte 5 runes + template-usage refinement per Q E2), Astro (T072/T073). Each SFC family parses with its own grammar then routes the script block through buildInventory(). Spec lives at docs/superpowers/plans/02-phase-3c-3d-3e.md ~lines 610 onward.