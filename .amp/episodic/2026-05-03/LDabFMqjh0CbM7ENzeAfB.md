---
id: LDabFMqjh0CbM7ENzeAfB
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4e complete — cross-language dispatch + mixed monorepo at f9966e6
outcome: approved
created_at: "2026-05-03T19:47:26.242Z"
---

[project:fugazi] Phase 4e (cross-language dispatch + mixed monorepo support T361-T370) landed at commit f9966e6 on phase-3-foundation. Single commit, 44 new tests. Test count 2258 → 2302. All 7 baseline gates exit 0.

T361 finished what 4c stubbed: extractOne now returns { inventory, complexity, lang, parseErrorCount }; extract loop aggregates filesByLang and parseErrors; metrics surface both. Parse errors soft-collected (never throw). .pyi stub files route through Python pipeline. T362 added .pyi to discovery + Python skip-dirs (__pycache__, .venv, venv, env, .env); tools/forbidden-strings.ts + forbidden-fallow-env.ts extended to scan .py/.pyi with Python-specific regexes (os.environ['FALLOW_*'], os.getenv('FALLOW_*')). T364 mixed-py-ts fixture: 4 Django .py (manage, settings, urls, views) + 3 React TS (App.tsx, Button.tsx, useAuth.ts) + pyproject.toml + package.json + fugazi.fixture.json + expected.json. runFixture produces filesScanned=7, filesByLang={ts:3, py:4}, 2 unused-deps findings, activePlugins includes typescript and dataclasses. T365 LSP accepts Python didOpen; cold analysis dispatches via runAnalysis. T366 MCP coverage_setup detects pytest via 11 candidate manifest files; emits pytest --cov snippet pointed at pyproject.toml. T367 watch fires on .py/.pyi, ignores .pyc. T368 fix engine handles .py/.pyi UTF-8 byte-offset edits unchanged (engine itself language-agnostic). T369 reporter base.ts + types.ts + json.ts gained updateMeta(patch); JSON reporter surfaces metrics.filesByLang + metrics.parseErrors. T370 ProgressEvent.lang optional field on extract.* events.

Decisions: single commit per dispatch preference; metrics.filesByLang+metrics.parseErrors on public type contract; ProgressEvent.lang optional at type level; full pytest --cov snippet; Reporter.updateMeta(patch) added to public interface with default impl in ReporterBase; LSP cold-analysis test switched from fixed 2s sleep to 12s poll-until-condition (exposes pre-existing cold-start flake under parallel turbo load with Python parser added).

Limitations carried to 4f/v1.x: per-language emission of extract.start/progress/done events not yet streaming-tagged (driver runs single mixed loop; lang field exists for downstream consumers when streaming/parallel extractor splits the loop). Cache wiring not yet plumbed through runAnalysis.extractOne (cache helpers have lang field from T310; runtime path doesn't call them yet — cache-on-read landing slated later). LSP language registration uses TextDocumentSyncKind.Full no per-language filter (Python documents flow through same pipeline as TS without explicit registration).

Phase 4 status: 4a ✓ + 4b ✓ + 4c ✓ + 4d ✓ + 4e ✓. Remaining: 4f tests + dogfood + docs (T371-T380) — Python conformance fixtures, project fixtures, ecosystem regression repos, real-project dogfood, README + PYTHON.md + COVERAGE.md updates.