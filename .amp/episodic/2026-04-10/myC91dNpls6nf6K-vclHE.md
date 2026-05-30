---
id: myC91dNpls6nf6K-vclHE
session_id: markov-logic-tree-impl-2026-04-10
agent_id: mcp
task: [project:agent-assist-cr] Write implementation plan for Markov Logic Tree probing question filter
outcome: approved
created_at: "2026-04-10T14:10:38.868Z"
---

[project:agent-assist-cr] Implementation plan written for the probing question filter (Markov Logic Tree). Key decisions:

1. always_ask flag on ProbingQuestion model — drain_mb_02 ("Are multiple drains affected?") always shown for all Drains calls, bypasses filter in code, never sent to LLM prompt. User correction: this is a core diagnostic question for the trade, not a sub-question.

2. ProbingFilterResult model with relevant_questions (list of IDs) and relevance_reasoning (dict for logging).

3. Filter agent uses same model tier as Stage 3 (config.gpt_model / nano). Runs in parallel with Stage 3 — zero added latency.

4. Pipeline tracks _shown_question_ids (Set[str]) for additive-only rule — questions shown can never be hidden. Filter locks when Stage 2 locks.

5. PipelineResult gains visible_question_ids: Optional[Set[str]] — None means show all (fallback/no filter). Applicator hides questions not in visible set via CONDITIONAL_HIDDEN, but never hides answered questions or agent overrides.

6. Final Review Safety Net (DrainCoordinator final sweep surfacing filtered-out answers) deferred to follow-up — core filter + default-to-include posture handles primary use case.

Plan saved to docs/superpowers/plans/2026-04-10-markov-logic-tree.md. 6 tasks, TDD throughout.