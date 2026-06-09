---
id: AnbQr7vRsibdIkz9QfK4t
session_id: markov-logic-tree-brainstorm-2026-04-09
agent_id: mcp
task: [project:agent-assist-cr] Brainstorming Markov Logic Tree for probing question progressive disclosure
created_at: "2026-04-09T23:33:49.154Z"
---

[project:agent-assist-cr] Markov Logic Tree Brainstorm — Probing Question Filtering

## Problem
Current system loads the full question set for a trade/job type combo (e.g., all 8 HVAC Demand Service questions). No fine-grained filtering within a set based on what the caller actually described. Agent sees irrelevant questions (e.g., sewage overflow questions on a sink clog call).

## Design Decisions Made
1. **Scope: Within-set filtering only.** Cross-category bleed (HVAC showing plumbing questions) is NOT a problem — the existing trade/job type selection is solid. The issue is purely within a single question set.
2. **UI behavior: Hidden, not dimmed.** Irrelevant questions should be completely invisible to agents. No collapsed sections, no "may also apply." Clean and focused.
3. **Timing: One-shot at question load time (after Stage 2).** No ongoing progressive disclosure from this feature — agents already deal with enough UI updates. Filter once when questions first load, done.
4. **Hybrid Markov approach.** User wants elements of both Markov Logic Networks (weighted logical rules) and Markov state transitions (context-driven probability), but the primary constraint is zero/minimal added latency.

## Three Approaches Evaluated
**A) Hand-authored rule graph** — JSON conditions per question, pure boolean eval at runtime. Zero latency but brittle, high authoring/maintenance burden, fights the regex-to-LLM migration direction.

**B) LLM-generated rules, human-reviewed** — LLM authors the rule graph offline, humans review, runtime is same as A. Less authoring effort but same brittleness, maintenance tax on question changes, and the two-phase trust problem (if LLM can author rules correctly, why not eval at runtime?).

**C) LLM nano call at runtime** — single nano inference after Stage 2, takes Stage 1 facts + question set, returns which questions are relevant. No rules to maintain, handles novel descriptions, aligns with regex-to-LLM migration. Adds ~200-500ms but can potentially run in parallel with Stage 3 (both only need Stage 1 facts), avoiding wall-clock latency impact. Risk: silent failure if question incorrectly hidden, mitigated by defaulting to "show" on uncertainty.

## Recommendation Presented
Approach C (LLM nano at runtime) was recommended for three reasons: (1) aligns with existing regex-to-LLM migration direction, (2) latency manageable via parallelization with Stage 3, (3) zero maintenance as clients/questions change. User has not yet approved — session ended before decision.

## Branch
Feature branch: markov-logic-tree

## Next Steps
- User needs to decide on approach (A, B, or C)
- If C: measure nano latency in parallel with Stage 3 to validate assumption
- Then: complete design spec, write implementation plan