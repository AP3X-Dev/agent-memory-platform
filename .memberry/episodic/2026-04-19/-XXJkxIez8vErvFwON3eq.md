---
id: -XXJkxIez8vErvFwON3eq
session_id: session-20260419-prp01-autonomous
agent_id: mcp
task: [project:ap3x-solana] T6 complete: borsh imperative codec helpers
outcome: approved
created_at: "2026-04-19T14:52:19.099Z"
---

[project:ap3x-solana] Task 6 complete (commit 28e5c7a). Implemented borsh.ts in @ap3x/solana-core as imperative codec (NOT schema-driven per spec Section 3.1). Reader and Writer classes with methods (not free functions) matching spec idiom `function readMintAccount(r: Reader): TokenMint`. All 11 primitive pairs: u8/16/32/64 + i64 + bool + bytes + vec + option + pubkey + string. Little-endian throughout via DataView (getBigUint64/getBigInt64 for 64-bit). Writer growable starting 128B doubling. readBytes uses buf.slice (copy); Writer.toBytes() uses #buf.slice(0, #length) (tight copy, no aliasing). readString uses fatal:true TextDecoder so malformed UTF-8 throws. readBool rejects any byte != 0/1. Every decode error includes byte offset. Consistent #private fields (no TS `private` mixing). Barrel exports both namespace `borsh.*` and flat `{Reader, Writer}` — flat-export lets consumers annotate with `Reader` bare per spec example. 66 new tests, package total 254/254 passing, 100% stmts/branches/funcs/lines on borsh.ts. Non-blocking observations: Reader.offset is publicly mutable (acceptable for protocol-parser rewind idiom, worth a comment); writeN* methods don't range-check inputs (matches imperative trust-caller idiom); readVec preallocates Array(u32_len) — DoS vector for untrusted inputs, fine for RPC-sourced bytes. Zero npm deps — only imports `./public-key`.