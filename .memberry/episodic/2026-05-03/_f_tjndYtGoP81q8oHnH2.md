---
id: _f_tjndYtGoP81q8oHnH2
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4a COMPLETE — all 11 tasks T301-T311 landed
outcome: approved
created_at: "2026-05-03T17:08:19.273Z"
---

[project:fugazi] Phase 4a (Python parser + AST + visitor) FULLY COMPLETE across 4 commits on phase-3-foundation: 575495c WASM, d0f6688 cross-lang Inventory + kinds-py + walker, e35f195 adapter + Inventory visitor, b774fd2 __all__ + TYPE_CHECKING + suppression + complexity + cache + property tests. All 11 in-scope tasks T301-T311 done. T312-T315 reserved for future polish (parse-error recovery, async edge cases, generator vs comprehension, .ipynb).

Files added in T306-T311 final wave: visitor-py/all-list.ts, type-checking.ts; suppress/parse-py.ts; complexity/cyclomatic-py.ts + cognitive-py.ts; cache/store.ts gained optional lang to CacheKeyParts. visitor-py/imports.ts accepts typeOnly flag. visitor-py/index.ts wires __all__ + TYPE_CHECKING through handlers. complexity/index.ts dispatches computeComplexityPy by file extension. suppress/index.ts dispatches by .py/.pyi extension. fast-check property tests added: ~12 invariants × 100 iterations.

Test count: 1848 (start of Phase 4) → 2003 active (+155: 20 T301 WASM + 18 T302+T303 walker + 39 T304+T305 adapter+visitor + 78 T306-T311 refinements). All 7 baseline gates exit 0.

Limitations carried into Phase 4b/4c/v1.x: (1) TYPE_CHECKING else: branch contents incorrectly treated as type-only — AST folds branches into single body[] (T307); (2) Cross-file TYPE_CHECKING resolution (from .compat import TYPE_CHECKING) deferred to Phase 4b resolver; (3) Halstead operator set TS-flavoured for MI; pure-Python operator set future polish; (4) bigint not added to Constant.value (precision loss for ints > MAX_SAFE_INTEGER); (5) Cognitive scanner doesn't track multi-line triple-quoted docstrings perfectly; (6) __all__ non-literal forms silently fall back without warning; (7) Comprehension target bindings not surfaced through kinds-py shape (identifier-usages still fire for x in [x for x in xs]); (8) For-loop tuple targets collapse to '' (single-target works correctly).

Phase 4a deliverable: Python source files now parse → discriminated AST → Inventory{ lang:'py', declarations, imports, usages } end-to-end. Suppression + complexity work for Python. Cache namespaced by language. Property invariants fast-check verified.

Next phase: 4b Resolver (T316-T330) — pyproject.toml/setup.py/setup.cfg/requirements.txt parser, sys.path resolution, relative imports, PEP 420 namespace packages, virtualenv awareness, Python stdlib allowlist, dispatcher routing by file extension. Estimated 7-9 days. Then 4c rule wiring, 4d plugins, 4e integration, 4f tests + dogfood + docs.