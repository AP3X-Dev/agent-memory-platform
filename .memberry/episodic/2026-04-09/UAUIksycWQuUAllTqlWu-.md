---
id: UAUIksycWQuUAllTqlWu-
session_id: oauth-integration-2026-04-09
agent_id: mcp
task: OAuth integration with portal.cicops.ai - agent profile and CIC tag auto-population
created_at: "2026-04-09T18:21:15.164Z"
---

[project:agent-assist-cr] Agent tag format is first name + last initial (e.g., "Jane S"). The CIC tag field in call forms needs to be auto-populated with the authenticated agent's tag from the profile endpoint. Profile endpoint (GET /api/v1/profile) will return email, name, and agent_tag. Agent tag attaches to forms on every call.