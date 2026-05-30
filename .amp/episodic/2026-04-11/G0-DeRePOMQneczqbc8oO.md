---
id: G0-DeRePOMQneczqbc8oO
session_id: session-20260410-probing-na-rules
agent_id: mcp
task: [project:agent-assist-cr] Add Plumbing, Drains, and cross-cutting N/A rules to probing_na_rules.py (Task 2)
outcome: approved
created_at: "2026-04-11T04:44:37.695Z"
---

[project:agent-assist-cr] Extended probing_na_rules.py with three new rule sets following the same fail-open, word-boundary pattern as existing HVAC rules.

Plumbing rules (_get_plumbing_na): tankless hides tank-size + tankless-or-standard; standard/tank WH hides tankless-or-standard; faucet/fixture hides age+energy+brand; toilet hides energy; outdoor faucet/hose bib/spigot hides energy+water-shutoff. 6 question-ID constant sets added.

Drains rules (_get_drains_na): phrase-based on problem_description/symptoms (NOT equipment_type). Kitchen sink/bathtub/shower → hide sewage (drain_mb_04) unless sewer/sewage also present. Single-fixture indicators → hide multiple-drains (drain_mb_02) unless "multiple" also present. Fail-open when no text provided.

Cross-cutting rules (_get_cross_cutting_na): Estimate/Maintenance job type + HVAC → hides hvac_mb_06 (shut-off). Same job types + Plumbing → hides water-shutoff IDs. Must Book/Demand Service/After Hours leave shut-off visible.

get_na_question_ids refactored: now unions results from all applicable rule sets rather than early-returning on first trade match. Trade-specific rules require equipment_type; Drains rules fire on problem_description or symptoms; cross-cutting fires on job_type alone.

34 targeted tests added (13 new); 683 total tests pass with no regressions. Committed as feat(probing): add N/A rules for Plumbing, Drains, and cross-cutting.