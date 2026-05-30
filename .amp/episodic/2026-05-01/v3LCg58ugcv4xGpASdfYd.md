---
id: v3LCg58ugcv4xGpASdfYd
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.4 Dispatch C-1 complete — dynamic-import + asset-URL handlers
outcome: approved
created_at: "2026-05-01T22:00:06.614Z"
---

[project:fugazi] Phase 3c.4 Dispatch C-1 landed at b2d7b8e on branch phase-3-foundation. Two new pure detectors plus AST/visitor extensions for dynamic-import partial-prefix extraction and asset-edge detection.

AST extensions:
- Expression union now includes NewExpression (callee + args) and TemplateLiteral (quasis: readonly string[], expressions: readonly Expression[]; quasis.length === expressions.length + 1).
- visit.ts childrenOf: newChildren returns [callee, ...args]; templateChildren returns expressions only (quasis are strings).
- parsers/oxc.ts classifyExpression maps SWC NewExpression / TemplateLiteral. SWC's TaggedTemplateExpression surfaces as a CallExpression{callee: tag, args: [template]} — best-effort to keep the inner template reachable for downstream pattern matching without UnknownExpression collapse.
- CRITICAL: AwaitExpression and YieldExpression now PASS THROUGH classification — they recurse on `node.argument` and adopt its classification (with the await/yield's range). Without this, `await import('./x')` collapsed to UnknownExpression and the dynamic-import handler in the visitor never saw it.

asset-url.ts (72 LOC, packages/extract/src/asset-url.ts):
- isImportMetaUrl(node): true when node is MemberExpression with object.kind === 'ImportMeta' and property.name === 'url'.
- matchAssetUrl(NewExpression): returns AssetUrlMatch{source, resolvable: true} when ALL hold: callee Identifier{name: 'URL'} (case-sensitive), args[0] Literal with string value, args[1] matches isImportMetaUrl. Returns null otherwise. Strict on purpose — missed asset edges are recoverable; spurious edges cause resolver thrash.

visitor/dynamic.ts (109 LOC):
- constantPrefix(TemplateLiteral): { prefix, isLiteral }. For `\`./mod-${name}\`` returns {prefix: './mod-', isLiteral: false}; for `\`${prefix}/x\`` returns {prefix: '', isLiteral: false}; for `\`./static\`` returns {prefix: './static', isLiteral: true}.
- classifyDynamicImport(CallExpression): three-shape discriminated return — 'literal' (resolvable, source = string literal), 'template' (non-resolvable, source = constant prefix), 'unresolvable' (non-resolvable, source = '').

visitor/imports.ts handleDynamicImport now delegates to classifyDynamicImport and maps shapes to Import records.
visitor/index.ts adds case 'NewExpression' that calls matchAssetUrl; pushes Import{kind: 'asset', resolvable: true, source: literal, range}.
visitor/types.ts ImportKind now includes 'asset'.

Existing visitor.test.ts updated: template-literal dynamic-import case `import(\`./${x}\`)` now asserts source: './' (was '') because the constant prefix is preserved on the Import record so the resolver can narrow candidates.

Public surface re-exported from packages/extract/src/index.ts: matchAssetUrl, isImportMetaUrl, AssetUrlMatch, classifyDynamicImport, constantPrefix, TemplatePrefix, DynamicImportShape.

CARRIED-FORWARD LIMITATION (documented in code): asset-URL constructors inside variable initializers (`const u = new URL(...)`) are not reached because the walker does not descend into VariableDecl.declarations[] declarator init slots. Each asset-URL fixture in dynamic-imports.test.ts is framed as a top-level expression statement. Two future mitigation paths: (a) visitor pre-scan over declarator inits in onNode handler for VariableDecl, or (b) extend AST with declarator.init?: Expression and walk it. Pick the lighter option — likely (a) — when downstream analyses need it.

Tests: 14 fixtures + 1 determinism test in __tests__/dynamic-imports.test.ts. Repo total now 500 active + 5 skipped (was 485 + 5).

Next: Dispatch C-2 (T067-test) — 15 fast-check property invariants for the visitor pipeline.