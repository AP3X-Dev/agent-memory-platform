---
id: OLtTpqIyRroh9gWvmNJ7d
session_id: oni-agent-loop-2026-03-30
agent_id: mcp
task: [project:oni-agent] Project inception — architecture design, roadmap, and loop prompt
outcome: approved
created_at: "2026-03-30T08:27:38.912Z"
---

[project:oni-agent] Oni-Agent is a TypeScript recreation of Hermes Agent (Nous Research, ~262K lines Python) built on @oni.bot/core v1.1.3. Key architecture decisions: Oni-Core Native approach using StateGraph where the agent loop, tools, and skills are graph nodes. OpenRouter as default LLM provider. Ink (React for CLI) for TUI. SQLite default + Redis optional for state. Telegram first for gateway (Grammy). Local + SSH for terminal backends. Full skill catalog port using Hermes Markdown format. pnpm + tsc for build. Full RL trajectory pipeline port.

The project is decomposed into 7 loops: (1) Foundation — scaffold, core graph, OpenRouter, basic REPL. (2) Tools — terminal, files, web, code execution. (3) CLI — Ink TUI with spinners, banners, commands. (4) Skills & Memory — loader, catalog, SQLite+FTS5, session search. (5) Gateway — Telegram adapter, sessions, delivery. (6) Delegation & Scheduling — SwarmGraph subagents, cron. (7) RL & Advanced — trajectories, batch runner, remaining platforms/tools.

Core state type is OniAgentState flowing through channels (messagesChannel, lastValue, appendList, ephemeralValue). Graph flow: promptBuilder → agent → toolRouter → toolExecutor → compressor → loop. Harness module provides agentLoop, HooksEngine, ContextCompactor, SafetyGate, SkillLoader. Memory is pluggable — local first, AMP integration planned for later loop.

97 tasks across 7 loops tracked in docs/ROADMAP.md. Autonomous build loop prompt at docs/LOOP_PROMPT.md runs every 5 minutes. Project lives at C:\Users\Guerr\Desktop\AG3NTS. Hermes reference at C:\Users\Guerr\Downloads\hermes-agent-main\hermes-agent-main. oni-core source at C:\Users\Guerr\Desktop\oni-core-cerebro.