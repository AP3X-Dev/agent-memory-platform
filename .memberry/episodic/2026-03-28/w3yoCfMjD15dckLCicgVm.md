---
id: w3yoCfMjD15dckLCicgVm
session_id: cic2-phase3-2026-03-27
agent_id: mcp
task: [project:cic2] Phase 3 task 2: SOP auto-ingest on startup
outcome: approved
created_at: "2026-03-28T06:05:09.124Z"
---

[project:cic2] Added _ingest_sop_profiles() function to runtime/main.py. Called during lifespan() after get_session_service(). Globs runtime/data/sops/*.json, runs SopNormalizer.normalize_file() + RuleCompiler.compile() for each. Idempotent via source_hash dedup. Logs warnings on individual file failures, continues processing rest. 5 new tests covering: all 8 profiles loaded, rules compiled, idempotency, custom temp SOP file, empty directory. 448 tests total now.