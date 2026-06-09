---
id: nrWHD77H4BrkOfW7z_p3E
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4c complete — Python rule wiring at 65d1473
outcome: approved
created_at: "2026-05-03T18:23:42.490Z"
---

[project:fugazi] Phase 4c (Python rule wiring T331-T338) landed at commit 65d1473 on phase-3-foundation. Single combined commit, 70 new tests. Test count 2084 → 2154. All 7 baseline gates exit 0. ALL 12 cross-cutting rules now produce findings on Python projects.

T331 design: Extended Declaration with optional fields (bases, annotation, valueCallee, decoratedMembers) — zero existing test breaks. Detects all 5 Python type forms: TypedDict, Protocol, TypeAlias, NewType, plus TypeAliasType/TypeVar/ParamSpec/TypeVarTuple.

T332 unlisted-deps: per-file pyproject.toml/setup.cfg/setup.py/requirements.txt walk via loadPythonManifest. New helper bareSpecifierToPyPackageName extracts leading segment (urllib.request → urllib). Verbatim message says 'is not declared in pyproject.toml' for Python files.

T333 unused-class-members: ~110-name dunder allowlist (__init__, __str__, __enter__, __exit__, __call__, __eq__, __add__, etc.) + decorator exemption (skip ALL decorated methods conservatively for v1; plugin layer 4d refines).

T336 code-duplication: new packages/core/src/dupes/tokenize-py.ts. Strips only first string-literal statement at module/class/function body start (PEP 257 docstring position). Strips # comments. Identifiers collapse to IDENT for Type-2 detection.

T338 private-type-leak: short-circuits .py files (zero issues for Python; mixed projects flag only TS leaks).

T334/T335/T337 needed no code changes (already language-agnostic).

runAnalysis dispatch — minimum partial-T361 patch: added .py to RECOGNIZED_EXTENSIONS; extractOne branches early for .py files to extractOnePython helper using parsePythonAst + buildPyInventory + computeComplexityPy. Full per-language driver dispatch (cache-key namespacing, plugin routing, parse-error reporters) stays scoped to Phase 4e T361.

Python rules now firing: unused-files, unused-exports, unused-types (T331), unused-deps, unused-dev-deps, unused-optional-deps, unused-class-members (T333), unused-enum-members, circular-dependencies (T334), boundary-violations (T337), unresolved-imports, unlisted-dependencies (T332), duplicate-exports, code-duplication (T336), complexity-hotspot (T335), cognitive-complexity (T335). private-type-leak intentional no-op for .py.

Limitations: PEP 695 `type X = int` statement — tree-sitter parses opaquely as UnknownStatement; rule detects desugared TypeAliasType(...) callee form only; full surface deferred to v1.x. Decorator-driven plugin allowlist conservative in T333; per-framework refinements in 4d. Mixed-language clone detection in same family not supported (per-file tokenizer dispatch but token streams collide independently). Full T361 driver remains in Phase 4e.

Phase 4 status: 4a ✓ + 4b ✓ + 4c ✓. Remaining: 4d ~30 framework plugins (T346-T360), 4e integration + cross-language dispatch (T361-T370), 4f tests + dogfood + docs (T371-T380).