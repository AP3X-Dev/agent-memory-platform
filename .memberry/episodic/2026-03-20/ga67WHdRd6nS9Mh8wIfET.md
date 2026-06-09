---
id: ga67WHdRd6nS9Mh8wIfET
session_id: security-audit-oni-core-2026-03-20
agent_id: mcp
task: Security audit of oni-core codebase: find HTTP route handlers without auth middleware, authorization bypass vulnerabilities, session management issues, CSRF protection gaps, and privilege escalation vectors
outcome: approved
created_at: "2026-03-20T19:58:58.437Z"
---

[project:oni-core] Security audit completed. Findings:

SUMMARY: oni-core is a library framework (not a web service with HTTP endpoints), so traditional HTTP/API route handler security concerns do not apply. The codebase focuses on agent orchestration and has comprehensive security hardening against injection, prototype pollution, path traversal, and unauthorized tool execution.

KEY SECURITY IMPLEMENTATIONS FOUND:

1. **Prototype Pollution Prevention (FIXED)**
   - deepMerge() in config/loader.ts filters dangerous keys: __proto__, constructor, prototype
   - executeTools() in harness/loop/tools.js strips these keys from hook modifiedInput
   - Tests confirm effectiveness: BUG-0062, BUG-0024

2. **Path Traversal & Command Injection Prevention**
   - validateSpawnCommand() (internal/validate-command.ts) rejects shell metacharacters and ../sequences
   - safeSkillPath() (swarm/self-improvement/skill-evolver.ts) validates paths stay within skills root, rejects null bytes
   - Both use strict allowlist approach

3. **SSRF Prevention**
   - All model factories (OpenAI, Anthropic, Google, OpenRouter, Ollama) validate URL schemes
   - Only allow https: and http: protocols (lines 236-238 in openai.ts, openrouter.ts)
   - URL parsing uses native URL constructor with try-catch

4. **Prompt Injection Prevention**
   - Supervisor sanitizeForPrompt() collapses newlines, truncates to 2000 chars, wraps in code fences
   - Supervisor sanitizeRole() limits role strings to 200 chars
   - SkillLoader escXml() escapes special characters for XML safety

5. **API Key & Credential Security**
   - MCP StdioTransport (mcp/transport.ts) builds minimal BASE_ENV, never forwards all process.env to child processes
   - Only PATH, HOME, TMPDIR, TEMP, TMP, LANG, TERM forwarded (line 88)
   - Explicit env config merged on top
   - Model factory constructors validate API key presence at init time (fail-fast)

6. **Error Message Sanitization**
   - throwModelHttpError() (models/http-error.ts) never exposes raw API response bodies
   - Generic status codes returned, auth hints provided only for specific providers (OpenRouter)
   - BUG-0258: storeAuthResolver sanitizes errors to avoid disclosing internal store paths

7. **Tool Permission System**
   - checkToolPermission() (guardrails/permissions.ts) enforces access control
   - Tools match against agent-specific permissions using string comparison
   - Allows wildcard "*" for all tools or specific array of tool names
   - ToolPermissionError thrown for unauthorized access

8. **Input Validation**
   - validateToolArgs() (harness/validate-args.ts) validates against JSON Schema subset
   - Checks required fields, types, enums, bounds, array sizes (max 1000 items)
   - Supports nested object validation

9. **Mermaid Diagram Injection Prevention**
   - toSwarmMermaid() escapes node IDs and labels
   - Bracket injection prevented: replaces [ with #lsqb;, ] with #rsqb;, " with #quot;

ZERO-DEPENDENCY DESIGN:
- No HTTP framework (express, fastify) included
- Optional peer deps: better-sqlite3, ioredis, redis (for checkpointers)
- Minimizes supply chain attack surface

POTENTIAL CONCERNS (Minor):

1. **Authorization Check via String Comparison**
   - Tool permissions use string array matching (not enum-based)
   - Risk: Typos in permission strings silently allow access
   - Mitigation: Type system enforces consistency at config time, tests cover permission enforcement

2. **Tool Execution Framework Scope**
   - Framework itself does not execute arbitrary code, but user-defined tools can
   - Responsibility shifted to users for tool input validation and sandboxing
   - Documented in SECURITY.md

3. **Budget Tracking Not Sole Control**
   - BudgetTracker provides limits but should not be sole rate-limit mechanism
   - Documented recommendation for server-side rate limiting in production

4. **Checkpoint Data Sensitivity**
   - Users responsible for encrypting SQLite/PostgreSQL backend storage
   - No built-in at-rest encryption for checkpoint data

NOT FOUND / N/A:
- No CSRF tokens (not applicable: library, not web service)
- No session management (stateless framework)
- No HTTP endpoint handlers (event bus is internal, not exposed)
- No cookie handling (not web-facing)
- No OAuth/JWT in core (delegated to user code)