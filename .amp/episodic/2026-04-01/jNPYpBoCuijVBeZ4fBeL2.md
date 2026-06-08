---
id: jNPYpBoCuijVBeZ4fBeL2
session_id: oni-core-design-20260331
agent_id: mcp
task: [project:oni-code] Design Section 2 — LSP Depth (5 new request methods)
outcome: approved
created_at: "2026-04-01T05:26:24.540Z"
---

[project:oni-code] Design approved for LSP Depth — 5 new request methods on LSPClient and LSPManager.

NEW METHODS ON LSPClient (src/lsp/client.ts):
- getDefinition(filePath, line, character) → LSPLocation[]
- getReferences(filePath, line, character) → LSPLocation[]
- getDocumentSymbols(filePath) → LSPDocumentSymbol[]
- getHover(filePath, line, character) → LSPHover | null
- getCompletions(filePath, line, character) → LSPCompletionItem[]

Each method: check state=ready, ensure file opened via touchFile, call sendRequest() with TextDocumentPositionParams, return typed result or empty/null on error.

NEW TYPES (src/lsp/types.ts):
- LSPLocation { uri, range }
- LSPDocumentSymbol { name, kind, range, selectionRange, children? }
- LSPHover { contents, range? }
- LSPCompletionItem { label, kind?, detail?, insertText? }

LSPManager (src/lsp/index.ts):
- Pass-through methods using getClientsForFile()
- Arrays merged across clients, hover returns first non-null

CAPABILITIES UPDATE (client.ts initialize handshake):
- Add definition, references, documentSymbol, hover, completion to ClientCapabilities

SCOPE: ~120 lines across 3 files. No new files. Mechanical wiring over existing JSON-RPC transport.