---
id: jq8UFHBRTYz139jMTjGwy
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4d complete — 24 Python framework plugins at 4ddb506
outcome: approved
created_at: "2026-05-03T19:04:57.776Z"
---

[project:fugazi] Phase 4d (Python framework plugins T346-T354) landed at commit 4ddb506 on phase-3-foundation. Single combined commit, 98 new tests. Test count 2154 → 2252. All gates green individually; concurrent turbo load reproduces pre-existing LSP cold-start + extract/node 5s timeout flakes (verified on baseline before changes).

Schema extension (T346): PluginDef gained packageManager: 'npm'|'pip'|'poetry'|'uv'|'auto' (default 'auto') + usedDecorators: readonly string[] (default []). PluginPackageManager type. Backwards-compat — defaults applied for existing 91 TS plugins. Zod schema + types.ts + index.ts barrel.

Detection (T347): detect.ts extended with PythonManifestForDetection, collectPythonDependencyNames, matchesPythonEnabler. packageManager-aware enablerMatchesAny. Dependency-rule branches both manifests in 'auto' mode. Local PEP 503 normalizer (avoids plugins → graph dep cycle).

24 plugins shipped (vs 30 target; chose strong over thin per dispatch guidance):
- Web (6): django, flask, fastapi, starlette, tornado, pyramid
- Test (3): pytest, unittest, hypothesis
- ORM (2): sqlalchemy, tortoise
- Validation (3): pydantic, dataclasses, attrs
- Async/queue (3): celery, rq, dramatiq
- CLI (2): click, typer
- Tooling-only (5): black, isort, ruff, mypy, pyright

Total bundled plugins: 91 → 115.

Decorator allowlist plumbing: T333 'skip ALL decorated' TIGHTENED to 'skip if decorator in active-plugin allowlist'. Wired through RuleContext.activePlugins → buildPyMemberExemptions in unused-members.ts → per-member overlap check (dotted + bare-form trailing segment). Legacy fallback preserves T333 behavior when no plugin contributes a usedDecorators list (avoids over-flagging in projects without Python plugins active).

Visitor enrichment: Declaration gained MemberDecoration interface + memberDecorations field. visitor-py/declarations.ts collectMemberDecorations populates per-method dotted decorator names. Cross-ref filter NOT extended with usedDecorators — rule reads ctx.activePlugins directly (strictly more efficient — don't generate findings we'd then drop).

Tests by package: plugins 173 → 265 (+92), core 501 → 507 (+6), extract 449 → 455 (+6).

Limitations/deferrals: T355 Jupyter notebooks (.ipynb) deferred to v1.x. T356-T360 reserved (sqlmodel, polars, FastAPI extras, poetry/uv tooling-only). unittest test_* method-prefix matching approximated via usedExports whole-file allowlist.

Phase 4 status: 4a ✓ + 4b ✓ + 4c ✓ + 4d ✓ (5 commits on phase-3-foundation: 575495c, d0f6688, e35f195, b774fd2, 7023748, 65d1473, 4ddb506 — actually 7). Remaining: 4e integration + cross-language dispatch (T361-T370) — finish what 4c stubbed for runAnalysis, mixed-monorepo fixture, language-aware progress events, parse-error reporting integration. Then 4f tests + dogfood + docs.