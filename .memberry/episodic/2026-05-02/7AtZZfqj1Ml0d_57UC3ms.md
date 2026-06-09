---
id: 7AtZZfqj1Ml0d_57UC3ms
session_id: session-20260502-054700
agent_id: mcp
task: [project:fugazi] Phase 3d.2 import specifier resolver T081-T090
outcome: approved
created_at: "2026-05-02T12:47:10.586Z"
---

[project:fugazi] Phase 3d.2 (T081-T090) landed in packages/graph/src/resolve/ as 13 source files + 5 test files (75 tests, all green). Architecture: synchronous FsAdapter abstraction (in-memory + node-backed); POSIX-only path utilities (no node:path use in hot path); five resolver strategies dispatched in priority order — relative, alias (built-in + override), tsconfig paths (longest-pattern-wins), node_modules (with package.json exports + conditions), bare external. Resolution result is a 3-shape discriminated union: resolved | external | unresolved (never throws). Caches: tsconfig parse + nearest-tsconfig + package.json all process-singleton, keyed by absolute path, with __clearForTest exits. Lint constraint hits: avoid `while m=re.exec()` (use matchAll), avoid `!` non-null assertions, conditional spreads under exactOptionalPropertyTypes. Notable design choices: (1) build-output -> source mapping (dist/foo.js -> src/foo.ts) implemented in fallbacks but not yet wired into the dispatcher; pnpm workspace fallback deferred since Fugazi's monorepo handling still owns that contract. (2) JSON-with-comments stripper rolled inline (no jsonc-parser dep). (3) react-native variant resolver kept separate from the dispatcher — caller opts in. (4) joinPosix is binary; chained as joinPosix(joinPosix(a,b),c) when 3-arg style is needed (caught one bug here during testing). Branch: phase-3-foundation, working tree shows resolve/ + __tests__/ untracked, NOT committed per instruction.