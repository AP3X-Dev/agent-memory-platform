---
id: qE6teeumXimxxZwoqJV4c
session_id: ap3x-phase2-runtime-2026-04-08
agent_id: mcp
task: [project:ap3x-core] Phase 2: Implement @ap3x/runtime package — prompt builder, parser, runner, ONI graph, scheduler
outcome: approved
created_at: "2026-04-09T06:28:04.180Z"
---

[project:ap3x-core] Completed Phase 2 implementation of @ap3x/runtime. All 8 tasks done: scaffold (prior session), types, TDD buildSystem prompt builder (9 tests), TDD parseAgentOutput parser (9 tests), run() API+CLI router, buildCompanyGraph ONI StateGraph, TDD HeartbeatScheduler (8 tests), barrel export. 34 total tests passing, typecheck clean. Key decisions: (1) ONI StateGraph requires Record<string,unknown> constraint but TS interfaces don't satisfy it — used any cast at boundary, can loosen in ONI later. (2) ONI model factory types needed ModelFactory cast since factories have optional typed second params. (3) ONI source is at C:\Users\Guerr\Desktop\oni-core-cerebro and user confirmed we can patch+publish if needed. Also fixed startup errors: renamed main.js→main.cjs for Electron CommonJS compat with "type":"module", added .jsx extension to App import.