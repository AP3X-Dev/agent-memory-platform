---
id: lzwYl3sUDiFck64OyNHkV
session_id: sop-panel-research-session
agent_id: mcp
task: [project:agent-assist-cr] New baseline session feedback — SOP panel content quality issues
created_at: "2026-03-31T19:43:00.098Z"
---

[project:agent-assist-cr] New baseline: afdb5080-73b5-477d-8df0-92bcf9321976 (54 chunks, full conversation).

User feedback on live test:
1. LATENCY: Form fields didn't populate until near end of 4-minute call despite optimizations
2. WRONG PRICING: Shows non-member pricing when customer stated service agreement (member). Pipeline Stage 2 correctly detects member, but SOP panel shows non-member fees.
3. TOO MUCH IRRELEVANT INFO: SOP panel dumps everything — tune-up pricing (not discussed), estimate pricing (not discussed), NOT PROVIDED alerts (not helpful), all hot topics (most irrelevant)
4. WHAT USER WANTS: Minimum viable info — regular hours (because scheduled for regular hours), member pricing ($89 waived with repairs), must-book rule, and relevant procedures only

The extraction pipeline is working correctly (5/5 probing, member detected, HVAC Must Book). The problem is entirely in the SOP panel's LLM prompt and content filtering — it surfaces too much and gets the pricing tier wrong.