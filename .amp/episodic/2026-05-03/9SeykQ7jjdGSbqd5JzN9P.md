---
id: 9SeykQ7jjdGSbqd5JzN9P
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4f carry-tightening complete — dogfood SC-36 GREEN at c9b70bc
outcome: approved
created_at: "2026-05-03T21:51:14.710Z"
---

[project:fugazi] Phase 4f carry-tightening landed at commit c9b70bc on phase-3-foundation. Single combined commit, 26 new tests. Test count 2345 → 2371. All 7 baseline gates exit 0. Three real Python analyzer bugs fixed.

Bug 1 (submodule promotion + package-init traversal): Added Import.names readonly field; visitor-py/imports.ts populates names from ImportFromStmt; graph/build.ts emits <source>.<name> submodule edges + synthetic <package-init> edges to ancestor __init__.py chain. py-relative-imports fixture: 3 unused-files → 0 unused-files.

Bug 2 (runAnalysis loads PythonManifest): runAnalysis loadPythonManifestForRun runs once per analysis gated on pyFileCount > 0; manifest threaded through ResolverContext.pythonManifest. graph/build.ts: Python external resolutions mark edge resolvable:true (parallels TS node_modules-resolved edges). Manifest cached as synchronous one-shot at graph-build time using loadPythonManifest(toPosix(projectRoot), nodeFsAdapter). py-decorators fixture: 1 unresolved-imports (flask) → 0.

Bug 3 (AnnAssign-class-member exemption + property-name member usage): Added Declaration.fieldMembers readonly field; visitor-py/declarations.ts collectAnnAssignFieldNames walks ClassDef body for class-level AnnAssigns; visitor-py/usages.ts handleAttribute now ALSO emits rightmost attr name as 'member' usage so Call(...).method() chains record method; rules/unused-members.ts buildPyMemberExemptions adds every name in decl.fieldMembers to exempt set. py-sample dogfood: 9 findings → 0 findings (3 unused-class-members on User.{id, name, display} dropped).

Dogfood SC-36 status: 0 findings / 8 files = 0% — well under <5% bar. YELLOW → GREEN.

Conformance/project fixtures refrozen (10 expected.json files): py-decorators, py-relative-imports, py-type-checking, py-unused-exports (conformance); py-decorators-method/basic, py-fastapi/router, py-pydantic/basemodel, py-pytest/conftest, py-relative-imports-deep/basic, py-unused-class-members/basic (project).

V1_LIMITATIONS.md removals: 'from .pkg import submodule does not always anchor through empty __init__.py'; 'Pyproject deps not consulted by the Python resolver'; 'Pydantic / SQLAlchemy declarative class members not tracked through constructor / ORM access'.

COVERAGE.md SC-36: YELLOW → GREEN. SC-37 stays YELLOW (24/30 plugins).

Decisions made: single combined commit (shared visitor-types.ts touch + conformance refreezes flow naturally together); fieldMembers field on Declaration rather than discriminated memberKind (additive backwards-compatible; TS path leaves undefined); synthetic <package-init> edge specifier rather than retrofitting __init__.py reachability into unused-files rule (keeps rule code untouched, edge model honest); handleAttribute emits BOTH base AND attribute name as 'member' usages (fixes User(...).display() underflagging — correct semantics for what consumers want from member-access tracking); made Python external resolutions resolvable:true in graph builder (only Python files; TS unchanged) since resolver only returns external for Python when head is in pyproject OR site-packages.

Project totals after T381 carry-tightening: 65 commits ahead of main on phase-3-foundation (b774fd2 → c9b70bc), 12 packages + tests workspace + 4 distribution surfaces + plan docs, 2371 active tests + 7 skipped, 115 bundled plugins (91 TS + 24 Python). Both languages produce zero-finding analysis on themselves and on representative dogfood projects. v1.0 publish-ready (apply RELEASE.md prereqs already done at 498e6d6; tag v0.1.0-rc.1; push tag → release.yml publishes 5 packages).