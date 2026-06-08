---
id: 3-ws7ym-7ODbAf1u7NQot
session_id: session-20260606-survey
agent_id: mcp
task: [project:ag3nt] survey: Hermes self-improvement gaps vs AG3NT
outcome: approved
created_at: "2026-06-07T02:22:47.651Z"
---

[project:ag3nt] Surveyed Hermes self-improvement stack vs AG3NT clean-room. Two major missing capabilities found: (1) Hermes agent/background_review.py — a post-turn background-review fork: after EVERY turn it spawns a daemon-thread forked AIAgent (inherits parent runtime + cached system prompt for prompt-cache reuse, tool whitelist limited to memory+skill tools) that actively writes memory AND patches/creates skills, with elaborate prompts encoding 'do NOT capture' anti-patterns (env-dependent failures, negative tool claims). AG3NT only has an in-band memory NUDGE + synchronous maybe_refine/maybe_propose in core/loop.py _post_turn — no separate forked reviewer. (2) Hermes agent/curator.py (1844 LOC) — autonomous skill-LIBRARY curator: idle/interval-triggered fork that consolidates narrow skills into class-level 'umbrella' skills, with a lifecycle state machine (active/stale/archived, pure time-based transitions), recoverable .archive/ + tar.gz snapshots (curator_backup.py), 3-way consolidation-vs-prune classification (model-declared absorbed_into + structured YAML + tool-call heuristics), per-run REPORT.md, and cron-job skill-ref rewriting. AG3NT skills/manager.py has per-skill score down-ranking but NO library curator, NO lifecycle/archive, NO consolidation. Also partial: Hermes honcho injects AI self-representation/peer-card/SOUL.md persona seeding (self-model evolution); AG3NT honcho.py only injects a user representation. AG3NT personas (core/personas.py) are static strings, no self-evolving SOUL.md.</content>
<parameter name="entities">["AG3NT", "Hermes", "background_review", "curator", "skills", "self-improvement", "honcho"]