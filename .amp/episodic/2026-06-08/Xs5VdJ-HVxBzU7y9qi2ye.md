---
id: Xs5VdJ-HVxBzU7y9qi2ye
session_id: session-20260607-ag3ntic-morph
agent_id: mcp
task: Task 8: StandingGrant model + id prefix + column adds
outcome: approved
created_at: "2026-06-08T05:27:18.339Z"
---

Task 8 complete. Added STANDING_GRANT="sg" to ids.py under Approvals section. Added StandingGrant model to models.py (end of file, section 10.18) with String PKs, ForeignKey on workspace_id (CASCADE) and employee_id (SET NULL), composite Index ix_grant_lookup. Added args_hash: Mapped[str | None] = mapped_column(String, nullable=True) to ToolCall model near runtime_tool_call_id. Added Alembic migration 20260608_0002 with down_revision=20260608_0001 covering only standing_grants create_table + tool_calls.args_hash add_column. runtime_session_key was already present - correctly skipped. 3 new tests all pass; full suite 195 passed. Commit 7e0ebe1.