---
id: BRzVNqd5AUBXIOD4-FJn9
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.2 Wave 5b-2 complete — WASM parser adapter (selected SWC over oxc)
outcome: approved
created_at: "2026-05-01T12:54:20.396Z"
---

[project:fugazi] Wave 5b-2 landed at commit 917ba5e on branch phase-3-foundation. Contract: T049-test + T050 from docs/superpowers/plans/02-phase-3c-3d-3e.md.

Engine pivot: selected @swc/wasm@1.15.32 over oxc-parser. Verified via context7: oxc-parser-wasm and @oxc-project/parser-wasm do not exist on npm; the unified oxc-parser package only ships native napi-rs bindings (would require a Rust toolchain at install time, violating Fugazi's no-bundling design constraint). The 'oxc.ts' filename is preserved as a stable import path; the public 'parse' symbol is engine-agnostic.

Adapter contract verified: WASM_INTEGRITY/WASM_MISSING throw FugaziParseError before parser code runs; syntax errors are FAIL-SOFT (returned in result.errors[], never thrown); empty source returns an empty Program; leading UTF-8 BOM stripped defensively; output byte-deterministic.

WASM pin (load + install): SHA-256 a400243367e0731a958f97e4cafd76b7282bd361c6a13e65d1d177d32ee125ec of node_modules/@swc/wasm/wasm_bg.wasm (15.1 MB).

Files: packages/extract/src/parsers/oxc.ts (283 lines), parsers/types.ts (136 lines, discriminated-union AST), src/__tests__/parser-oxc.test.ts (290 lines, 24 tests = 6 contract + 18 language fixtures). Re-exported from packages/extract/src/index.ts. Manifest entry at packages/extract/wasm/manifest.json blobs.swc; install-time pin at tools/wasm-pins.json.

Repo state: 383 tests pass (220 types + 124 config + 39 extract). All 7 gates exit 0 (build, typecheck, lint, test, forbidden-strings, forbidden-fallow-env, verify-wasm). Build byte-deterministic.

Wave 5b-3 disposition: original plan was a second-engine fallback for cross-validation. Since SWC was selected as primary engine (not oxc), the literal "SWC fallback" task no longer makes sense. Two interpretations: (a) add a true second engine like @babel/parser for cross-val, OR (b) defer until risk/coverage signals indicate need. Recommendation: defer 5b-3, proceed to Wave 5b-4 (T053-test/T054 ScanError fail-soft wrapper) as the next dispatch since it's a hard prerequisite for 3c.3 cache + 3c.4 visitor.

Lessons: SWC's parseSync API is sync (throws on syntax error, doesn't return errors[]), wrapped via try/catch in adapter; adapter manually builds line-offset table for byte-offset → Position conversion (UTF-8 byte-counting from JS UTF-16 string requires explicit codeStep helper for surrogate pairs and multi-byte chars); module-level cachedSwc singleton holds the dynamic-imported @swc/wasm module after first successful integrity check.