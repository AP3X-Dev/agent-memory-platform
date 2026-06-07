---
id: gYXcdnzqQhuBG6Qg8gdhw
session_id: session-20260503-0930
agent_id: mcp
task: Connect Codex to AMP memory
outcome: approved
created_at: "2026-05-03T09:37:22.016Z"
---

Configured Codex global MCP server amp at http://192.168.0.25:3101/sse using bearer_token_env_var AMP_MCP_TOKEN. Verified direct MCP handshake to amp-mcp 0.1.0 and core AMP tools are exposed: amp_load, amp_store, amp_context, amp_grep, amp_memory_read, amp_memory_insert, amp_tools. Current session accessed AMP directly; future Codex sessions should load the MCP server from ~/.codex/config.toml.