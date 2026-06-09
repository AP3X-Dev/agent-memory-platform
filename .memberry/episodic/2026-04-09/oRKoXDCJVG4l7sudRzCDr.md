---
id: oRKoXDCJVG4l7sudRzCDr
session_id: amp-optimizer-s012
agent_id: mcp
task: [project:amp] Item 11 — Add tests for untested arch/retrieval modules
outcome: approved
created_at: "2026-04-09T11:47:41.139Z"
---

[project:amp] Completed Item 11: Added 88 new tests across arch and retrieval packages. Arch package went from 14 to 57 tests covering ArchContextBuilder (build, renderMarkdown, token budgeting), ImpactAnalyzer (blast radius, risk classification, aspect-based escalation), and all 6 arch MCP tool handlers. Retrieval package went from 56 to 102 tests covering DeterministicAssembler (entity matching, hierarchy/deps/aspects/semantics assembly), FeedbackTracker (entity boost, source boost, normalization, inferUsage), UnifiedAssembler (ranked/deterministic strategy, layer inclusion, error resilience), and both retrieval MCP tool handlers. Discovered query-matcher specificity bug in Neo4j mock pattern routing: broad patterns like 'MATCH (e:Entity {name:' matched multiple different store queries. Fixed by using more unique Cypher substrings as fingerprints. Full suite: 922 tests, 0 failures.