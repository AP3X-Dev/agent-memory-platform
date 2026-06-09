---
id: -bqm-LVMLUBj9B2n9xhG-
session_id: session-20260416-151500
agent_id: mcp
task: [project:agent-assist-cr] Close the three 'operational-core gaps' documented in CLAUDE.md — cadence→pipeline, LLM runners, DeepGram cost.
outcome: approved
created_at: "2026-04-16T22:39:36.349Z"
---

[project:agent-assist-cr] Investigation revealed the three "gaps" were stale docs, not missing wires. All three paths are wired end-to-end and covered by integration tests (`test_cadence_runs_pipeline.py`, `test_build_stage_runners_builds_real_runners_when_key_present`, `test_deepgram_cost.py`). The real risk was silent-fallback branches masking misconfiguration in prod — e.g., empty OPENAI_API_KEY falling back to null runners logged only at INFO, and a missing cost_tracker silently dropping audio minutes.

Resolution (2026-04-16): added WARNING logs at each silent-fallback branch:
1. `llm_runners.build_stage_runners` + `build_drain_runners` → WARNING when `OPENAI_API_KEY` is empty, naming the operational impact ("extraction will be a no-op").
2. `deepgram_stream._record_stream_cost` → WARNING when `cost_tracker is None` but `started_at is not None`, naming the dropped seconds. Pre-open closes (`started_at is None`) stay silent — nothing to record, nothing to warn.
3. `SessionManager.__init__` → WARNING when `async_worker` is set but `pipeline_factory is None` (inconsistent wiring = silent tick no-op).

Each WARNING is pinned by a caplog-based test. CLAUDE.md "Current phase" rewritten to reflect that these paths are wired + observability-hardened, not orphaned. Verification: 1053 tests pass, mypy --strict clean (81 files), ruff clean.

Convention established: at every silent-fallback branch in production paths, emit a WARNING log that names (a) the data or action being dropped, (b) the missing dependency, (c) what to do to fix it. Pin the WARNING with a caplog test so the branch can't silently regress to INFO or DEBUG.

Pattern worth reusing: when docs describe "missing wiring," verify the claim against actual code + existing tests before implementing. Stale CLAUDE.md is a stronger signal to refresh docs than to write new code.