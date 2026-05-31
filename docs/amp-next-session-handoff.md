# AMP Next Session Handoff

Use this file first when resuming the AMP hardening goal.

## Objective

Improve, optimize, harden, and expand the AMP memory system as much as possible without human intervention. Do not mark the goal complete unless current evidence proves no meaningful non-human work remains.

## Repo and Runtime

- Local repo mirror: `C:\Users\Guerr\Desktop\amp-memory-system`
- Live repo on Cerebro: `/home/cerebro/projects/amp`
- Primary server: `cerebro@192.168.0.25`
- MCP service: `amp-mcp.service`, port `3101`
- Wiki service: `amp-wiki.service`, port `3200`
- Do not run `amp-snapshot.service` unless the user explicitly approves a service-created git commit.
- Local mirror currently lacks installed Node test tooling; use Cerebro for authoritative build/test runs.

## Current State

The tree is intentionally dirty from the ongoing hardening pass. Preserve existing changes unless the user explicitly asks for cleanup or reset.

Recent completed areas:

- Wiki usability: canonical project rows, internal scope filtering, project breadcrumbs, project-scoped search, readable TOC anchors, project-scoped source/topic links, project-scoped compile support.
- Query hardening: bounded raw Cypher, admin command rejection, `CALL {}` delegated to `ScopedQuery.rawCypher`, `amp_grep` parameterization and limit normalization.
- Code memory: ast-grep structural search, oversized-file guard, tree-sitter runtime grammar normalization, `SYMBOL_CALLS` extraction, scoped/bounded `amp_code_deps` and `amp_code_symbols`, watcher/reindex filters, call-graph noise filtering.
- Latest parser improvements: TypeScript/JavaScript const-assigned arrow functions and function expressions now index as callable function symbols, and class property arrow/function expressions now index as contained `method` symbols. Both preserve expected `SYMBOL_CALLS` edges without creating bogus parameter or inner function-expression symbols.
- Newest parser slice (2026-05-30): re-export statements (`export { x } from './y'`, `export * from './y'`, `export * as ns from './y'`) are now captured as `ImportInfo` module dependencies so `resolveImports` can create `SYMBOL_IMPORTS` edges for them, while local-only exports (`export { x }` with no `from`) and `export default <decl>` are correctly left out of import extraction. Default-exported named functions and classes (and object-literal methods) were verified already indexing correctly and are now locked in with regression tests.
- Module-anchor slice (2026-05-30): a live MCP indexing smoke (Next Best Work item 2) revealed that the re-export fix only created edges when the re-exporting file also declared its own symbols. A *pure* barrel (`index.ts` that only re-exports, Python `__init__.py` that only re-imports) declares zero symbols, so `resolveImports` had no `from:Symbol` anchor and the module dependency was silently dropped. Fixed `parseFile` to emit one synthetic `module` symbol when `symbols.length === 0 && imports.length > 0`. The `module` kind was already whitelisted by `resolveImports` on both endpoints, so this completes existing design without new edge semantics. Validated end-to-end against live Neo4j: `pure-barrel.ts` went from 0 to 2 `SYMBOL_IMPORTS` edges.

Latest touched files from the parser slice:

- `packages/code/src/parser.ts`
- `packages/code/src/__tests__/parser.assigned-functions.test.ts`
- `packages/code/src/__tests__/parser.class-fields.test.ts`
- `packages/code/src/__tests__/parser.object-methods.test.ts`
- `packages/code/src/__tests__/parser.re-exports.test.ts`
- `packages/code/src/__tests__/parser.default-exports.test.ts`
- `packages/code/src/__tests__/parser.module-anchor.test.ts`
- `docs/amp-hardening-handoff-2026-05-29.md`
- `docs/amp-next-session-handoff.md`

## Latest Verification on Cerebro

Run from `/home/cerebro/projects/amp`:

```bash
npm test --workspace @amp/code -- src/__tests__/parser.assigned-functions.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.assigned-functions.test.ts src/__tests__/parser.calls.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.class-fields.test.ts
npm test --workspace @amp/code -- src/__tests__/parser.class-fields.test.ts src/__tests__/parser.assigned-functions.test.ts src/__tests__/parser.calls.test.ts
npm test --workspace @amp/code
npm run build && npm test
```

Observed latest results:

- Focused assigned-function parser test: 1 passed.
- Focused class-field parser test: 1 passed.
- Class-field, assigned-function, and call-graph parser tests: 3 passed.
- Full `@amp/code`: 14 test files passed, 90 tests passed.
- Root build passed.
- Full workspace tests passed:
  - core: 204 passed / 3 skipped
  - neo4j: 148 passed
  - redis: 65 passed
  - mcp: 96 passed / 7 skipped
  - research: 138 passed
  - arch: 55 passed
  - code: 97 passed (was 94; +3 from module-anchor parser tests)
  - retrieval: 114 passed
  - wiki: 235 passed / 1 skipped

Built parser runtime smoke passed:

- Parsed a temporary TypeScript file through `packages/code/dist/parser.js`.
- Symbols: `helper:function`, `normalize:function`, `buildRunner:function`.
- Calls: `normalize -> helper`, `buildRunner -> normalize`.
- Parsed a temporary TypeScript class-field file through `packages/code/dist/parser.js`.
- Symbols: `persist:function`, `Worker:class`, `run:method`, `format:method`.
- Containment edges: `Worker -> run`, `Worker -> format`.
- Calls: `run -> persist`, `format -> persist`.

Latest MCP restart after this slice:

- `amp-mcp.service` active.
- Main PID: `1413218`.
- `/healthz`: `200`.
- unauthenticated `/readyz`: `401`.
- `ExecStartPost=/usr/bin/npx tsx packages/mcp/src/readyz-check.ts` exited with status `0`.

Latest wiki UI refresh before this parser slice:

- `amp-wiki.service` active with PID `1370953`.
- Restart compile emitted 19 projects, 154 articles, 970 episodic references, 2 library pages, 16 topic pages, and 3 cross-project pages.
- Live checks confirmed project breadcrumbs/search controls, filtered-search state, readable topic anchors, project graph links, no raw `[[...]]` on checked topic pages, and no `__boot_smoke__` on the portal.

## Sync Pattern

Edit locally with `apply_patch`, then copy changed files to Cerebro:

```powershell
scp C:\Users\Guerr\Desktop\amp-memory-system\<path> cerebro@192.168.0.25:/home/cerebro/projects/amp/<path>
```

Normalize line endings on Cerebro:

```bash
perl -0pi -e 's/\r\n/\n/g' <changed-files>
```

## Next Best Work

Good next slices that continue the objective:

1. ~~Add more parser/indexer coverage for common codebase shapes (default-exported functions/classes, object literal methods, re-export/import alias relationships).~~ DONE 2026-05-30: object-literal methods and const-assigned/class-field functions already covered; default exports verified + regression-tested; re-exports now produce `ImportInfo`/`SYMBOL_IMPORTS` edges. Possible follow-ups: namespace import member calls (`import * as ns; ns.foo()`), and Python/Go/Rust re-export equivalents.
2. Add live code-memory indexing smokes through the MCP tools, not only parser unit tests. PARTIALLY DONE 2026-05-30: re-export `SYMBOL_IMPORTS` edge creation is now smoked against the live Neo4j graph via `amp_code_index` + `amp_query` (and a standalone driver smoke using the freshly-built `dist`). That smoke is what surfaced the pure-barrel module-anchor gap, now fixed. Remaining: live smokes for the other edge classes (`SYMBOL_CALLS`, `SYMBOL_INHERITS`/`SYMBOL_IMPLEMENTS`, `SYMBOL_CONTAINS`, `DEFINED_IN`) and for namespace-import member calls. Note: validating a parser change live requires the new `dist` to be loaded — either restart `amp-mcp.service` (which severs the *current* session's MCP link; store memory first) or run a standalone Node smoke against `packages/code/dist` + a direct Neo4j driver (no restart needed), as done for this slice.
3. Audit the generated code graph for remaining noisy or missing relationship edges using real AMP files.
4. Continue hardening project scoping across any remaining retrieval or architecture paths with live Cypher evidence.
5. Verify the snapshot timer only after explicit approval if manual execution would create a commit.

## Final Hygiene to Repeat

Before handing off again:

```bash
git diff --check
rg -n "[ \t]$" <touched-files>
npm run build && npm test
```

For service-facing slices, restart the relevant service and record PID plus health checks.
