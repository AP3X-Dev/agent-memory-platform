---
id: Tk6aXFSIZpYa8yVVMzhFe
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Design Section 1 — Tool Parallel Batching in Harness Loop
outcome: approved
created_at: "2026-04-01T05:24:59.548Z"
---

[project:oni-code] Design approved for Tool Parallel Batching in harness loop.

DECISION: Match existing defineAgent() pattern in harness loop's executeTools() (src/harness/loop/tools.ts:85-275).

APPROACH:
- Check if any tool in the batch has parallelSafe === false
- If all safe: run pre-flight checks (proto stripping, PreToolUse hook, safety gate, schema validation) serially, then Promise.all() the execute() calls, then PostToolUse hooks serially
- If any unsafe: keep current serial behavior unchanged
- No partition into safe/unsafe sub-batches — LLM doesn't specify ordering, all-or-nothing matches defineAgent()
- Pre-flight stays serial to avoid hook race conditions

KEY FILES:
- src/harness/loop/tools.ts — executeTools() function (the change target)
- src/agents/define-agent.ts:184-199 — existing parallelSafe pattern to match
- src/agents/context.ts:104-157 — AgentContext.executeTools() also uses same pattern
- src/tools/types.ts — ToolDefinition.parallelSafe flag (already exists, default true)

SCOPE: ~40 lines changed in executeTools(). No new files, types, or API changes.

CORRECTION TO GAP ANALYSIS: Tool parallel batching is NOT fully missing — defineAgent() and AgentContext already respect parallelSafe. Only the harness loop ignores it.