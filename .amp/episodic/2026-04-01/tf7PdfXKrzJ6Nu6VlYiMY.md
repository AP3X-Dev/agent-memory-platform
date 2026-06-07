---
id: tf7PdfXKrzJ6Nu6VlYiMY
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] All 4 core primitives implemented, tested, and reviewed on feat/core-primitives
outcome: approved
created_at: "2026-04-01T06:16:13.849Z"
---

[project:oni-code] All 4 core primitives COMPLETE on branch feat/core-primitives in oni-core-cerebro.

COMMITS (6 total, oldest first):
- fcf9cc7 feat: add parallelSafe batching to harness loop executeTools()
- f23a042 fix: address code review — result ordering, dead code, error test coverage
- f82d204 feat(lsp): add definition, references, symbols, hover, completion methods
- af05f2c feat: add spawnAgent() and AgentHandle for background agent execution
- 87357ca feat: add MemoryExtractor for automatic fact extraction and consolidation
- e4a8d32 fix: address code review — consolidation test coverage, error logging, regex cleanup

TEST RESULTS: 287 test files, 1594 tests pass (up from ~1564 baseline), 0 failures, typecheck clean.

NEW FILES CREATED:
- src/harness/background-agent.ts (spawnAgent, AgentHandle)
- src/harness/memory/extractor.ts (MemoryExtractor)
- src/__tests__/tools-parallel.test.ts (5 tests)
- src/__tests__/lsp-client-requests.test.ts (18 tests)
- src/__tests__/background-agent.test.ts (6 tests)
- src/__tests__/memory-extractor.test.ts (5 tests)

MODIFIED FILES:
- src/harness/loop/tools.ts (parallelSafe batching)
- src/harness/types.ts (messageQueue, memoryExtractor, autoConsolidate)
- src/harness/loop/index.ts (message queue drain, await finalizeMemory)
- src/harness/loop/memory.ts (async finalizeMemory, extractor wiring)
- src/harness/index.ts (re-exports)
- src/harness/memory/index.ts (re-export MemoryExtractor)
- src/lsp/types.ts (LSPLocation, LSPDocumentSymbol, LSPHover, LSPCompletionItem, TextDocumentPositionParams)
- src/lsp/client.ts (5 request methods, ensureFileOpen, capabilities update)
- src/lsp/index.ts (5 pass-through methods, type re-exports)

NEXT STEP: Core is ready. oni-code product work can begin — wiring MCP, registering apply_patch, booting plugins, expanding commands, using the new core primitives.