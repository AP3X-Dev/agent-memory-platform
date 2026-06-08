---
id: HRK4wcHq51WrYrRpARvPo
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Expanded notes fields (8a-8e) + UI sections (22a-22d)
outcome: approved
created_at: "2026-03-28T08:00:18.879Z"
---

[project:cic2] Added all CIC1 notes fields to FinalSummary: your_contributions (agent turns filtered for substance), their_contributions (customer turns filtered for substance), follow_ups_for_you (agent commitment patterns), follow_ups_for_them (customer followup patterns from agent speech), structured action_items with {task, owner, due}. Key design decisions: deterministic extraction via regex patterns rather than LLM calls, matching CIC1's LLM output schema so the frontend can render identically. NotesPanel redesigned with full CIC1 section layout — section headings match CIC1 exactly (Agent Actions, Customer Reported, Agent Follow-ups, Customer Follow-ups, Decisions). Owner badges use CIC1's exact colors: teal (#E0F2F1/#00897B) for agent, blue (#EFF6FF/#2563EB) for customer, orange (#FFF7ED/#EA580C) for both. Rolling summary shown during call, replaced by full final summary sections after session stop. 478 tests pass.