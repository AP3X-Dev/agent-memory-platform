---
id: 3qzGbX7ZyHBwmblbrlBAw
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4 COMPLETE — Python support shipped at 2b067bd
outcome: approved
created_at: "2026-05-03T20:32:07.295Z"
---

[project:fugazi] PHASE 4 FULLY COMPLETE. Phase 4f (T371-T380) landed at commit 2b067bd on phase-3-foundation. Single combined commit, 43 new tests. Test count 2302 → 2345. All 7 baseline gates exit 0.

Phase 4 full arc — 8 commits on phase-3-foundation:
1. 20fec7c — docs Phase 4 plan (T301-T380)
2. 575495c — 4a T301 tree-sitter-python WASM integration
3. d0f6688 — 4a T302+T303 cross-lang Inventory + kinds-py + walker
4. e35f195 — 4a T304+T305 parser adapter + Inventory visitor
5. b774fd2 — 4a T306-T311 __all__ + TYPE_CHECKING + suppression + complexity + cache + property tests
6. 7023748 — 4b T316-T322 Python resolver
7. 65d1473 — 4c T331-T338 Python rule wiring
8. 4ddb506 — 4d T346-T354 24 Python framework plugins + schema extension
9. f9966e6 — 4e T361-T370 cross-language dispatch + mixed monorepo
10. 2b067bd — 4f T371-T380 fixtures + ecosystem + dogfood + docs

Test count arc through Phase 4: 1848 (start) → 2345 (end), +497 net new tests over Phase 4.

Phase 4f deliverables: 5 conformance fixtures (py-basic, py-unused-exports, py-relative-imports, py-decorators, py-type-checking) frozen with expected.json. 15 project fixtures across themes (django, flask, fastapi, pytest, sqlalchemy, pydantic, celery, click, namespace-pkg, relative-imports-deep, star-imports, type-checking-cycle, decorators-method, async-await, unused-class-members). 5-repo Python ecosystem scaffold (django, flask, fastapi, pytest, httpx) with py-runner.ts mirror + .github/workflows/ecosystem.yml step. py-sample dogfood (Flask + 2 blueprints + Pydantic + tests). 12 fast-check property tests / 14 test cases (visitor 5, resolver 3 props/5 cases, inventory 4). 100 iterations each.

Documentation: README updated (Languages line + Python quickstart). packages/cli/README updated. New docs/PYTHON.md with 11 sections. COVERAGE.md SC-32-SC-38 added (5 GREEN, 2 YELLOW). docs/V1_LIMITATIONS.md Python carries section. docs/DOGFOOD.md py-sample disposition.

SC status: SC-32 GREEN (conformance freezes), SC-33 GREEN (mixed-py-ts), SC-34 GREEN (per-rule py tests), SC-35 GREEN (ecosystem scaffold), SC-36 YELLOW (py-sample 9 findings on 8 files = 112% > 5% bar; dispositioned as v1.x carries — package-init-not-reachable, pyproject deps not resolved, BaseModel field tracking), SC-37 YELLOW (24/30 plugins shipped — sqlmodel, polars, FastAPI extras, poetry/uv tooling-only deferred), SC-38 GREEN (docs).

Honest disclosure carried as v1 limitations: (1) py-relative-imports fixture surfaces from .sub import foo doesn't anchor through empty __init__.py — false-positive unused-files; (2) py-decorators surfaces flask resolver doesn't consult pyproject deps — unresolved-imports false-positive; (3) py-type-checking surfaces TypedDict members emit unused-class-members (Pydantic-style declarative tracking deferred). Per dispatch policy, rule code NOT modified to suppress findings — captures honest behavior for v1.x improvement targets.

What works for Python today end-to-end: bunx fugazi audit on pure-Python project + on mixed TS+Python monorepo. tree-sitter-python parses Python 3.11+ syntax. 24 framework plugins activate (Django, Flask, FastAPI, pytest, Pydantic, etc.). All 12 cross-cutting rules produce findings. Cache namespaced by language. Watch + fix + coverage-setup + LSP + MCP + Node-API all language-agnostic.

Project totals end of Phase 4: 64 commits ahead of main, 12 packages + tests workspace + 4 distribution surfaces + plan docs, 2345 active tests + 7 skipped, 115 bundled plugins (91 TS + 24 Python).

Next decisions for user: (1) tag v0.1.0-rc.1 + push tag + npm publish; (2) tighten remaining 4f YELLOW carries (relative-imports anchor, pyproject deps in resolver, BaseModel tracking); (3) Context-Engine integration prototyping.