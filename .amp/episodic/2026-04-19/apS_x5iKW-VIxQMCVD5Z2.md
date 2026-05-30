---
id: apS_x5iKW-VIxQMCVD5Z2
session_id: session-20260419-prp01-autonomous
agent_id: mcp
task: [project:ap3x-solana] T8 complete: HttpClient with retry/timeout/circuit breaker
outcome: approved
created_at: "2026-04-19T15:21:04.768Z"
---

[project:ap3x-solana] Task 8 complete across two commits: b068e1a (initial impl) + 7d8e2a3 (fix-up for three Important review issues). HttpClient: EventEmitter-based, single `request()` code path owns retry/timeout/circuit/metrics. Injectable now/delay/random for deterministic tests. Retries 5xx + 429 honoring Retry-After integer seconds, exp backoff * (1 + random()*jitter). AbortSignal.any composition with Node < 20.3 fallback path that explicitly removes listener in finally (fix: original had leak). Circuit breaker states closed→open→half-open→{closed|open} with `_inflightHalfOpenProbe` flag preventing concurrent half-open probes (fix: original allowed two through). Circuit rejection throws RpcError('circuit_open', ...) with code 'rpc.circuit_open' (extended RpcErrorCode enum to 6 values — spec deviation, intentional). 429-exhausted throws 'rpc.rate_limited' not 'rpc.http'. Metrics event per-request including circuit-rejected with {latencyMs, statusCode?, errorClass?, retryCount}. errorClass values: 'timeout'|'network'|'http'|'circuit_open'. 38 new tests (31 initial + 7 fix-up), suite 329/329, http-client.ts 98.53%/93.8%/88.23%. Root package.json gained msw ^2.13.4 as devDep; lockfile updated. Key deviation from spec Section 3.1: RpcErrorCode expanded from 5 to 6 values (added circuit_open) to disambiguate breaker rejections from HTTP failures — tracked as intentional spec extension, both code and metrics errorClass align.