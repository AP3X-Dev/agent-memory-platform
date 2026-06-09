---
id: EE7FBgwnXJrXmJsSIrjKy
session_id: session-20260419-prp01-autonomous
agent_id: mcp
task: [project:ap3x-solana] T7 complete: structured error hierarchy
outcome: approved
created_at: "2026-04-19T14:59:21.813Z"
---

[project:ap3x-solana] Task 7 complete (commit 071b016). Implemented errors.ts: abstract Ap3xError base + 4 concrete subclasses (RpcError, DecodingError, TimeoutError, ConfigError) with structured required metadata per class. Namespaced telemetry codes — RpcError uses template literal type `rpc.${RpcErrorCode}` giving 5 autocomplete-friendly values (rpc.timeout|rpc.rate_limited|rpc.http|rpc.rpc_method|rpc.parse); others are 'decode'/'timeout'/'config'. ES2022 native Error.cause used via `override readonly cause?: unknown` for noImplicitOverride. Base sets this.name = new.target.name so subclass name reflects even from base constructor. Abstract base prevents unclassified errors. DecodingErrorMeta.expected and .actual both required (per spec's un-optional syntax). TimeoutErrorMeta requires op+timeoutMs; ConfigErrorMeta requires field. 37 new tests, suite now 291/291 passing, 100% coverage on errors.ts. Non-blocking observations: (1) cause is double-assigned (super passes options AND class field assignment) which makes cause enumerable on Ap3x errors vs non-enumerable on plain Error — could drop re-assignment for symmetry; (2) meta not defensively copied/frozen — caller mutation post-throw possible; (3) test gap — no assertion that super(message, options) path vs field-shadow covers native cause. All non-blocking. Zero npm imports.