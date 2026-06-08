---
id: hsPucKKDXkFFOz2kq8MO8
session_id: autonomous-fugazi-2026-04-30
agent_id: mcp
task: [project:fugazi] Phase 3c.4 Dispatch A complete — discriminated-union AST kinds + walker
outcome: approved
created_at: "2026-05-01T20:38:01.050Z"
---

[project:fugazi] Phase 3c.4 Dispatch A landed at 21617b3 on branch phase-3-foundation. The Statement union grew from 3 variants (ImportDeclaration | ExportDeclaration | UnknownStatement) to 14 (ImportDecl, ExportDecl, FunctionDecl, ClassDecl, VariableDecl, TypeDecl, EnumDecl, ExpressionStatement, IfStatement, ForStatement, WhileStatement, SwitchStatement, BlockStatement, UnknownStatement). Expression union has 7 variants (CallExpression, Identifier, Literal, MemberExpression, ImportMeta, JSXElement, UnknownExpression). The closed ASTNode union (Program ∪ Statement ∪ Expression) is enforced via assertNever switches; tsc --noEmit is the gate.

Stable boundary decisions:
- AST lives at packages/extract/src/ast/kinds.ts. parsers/types.ts re-exports the names so the existing import path (parsers/types.js) keeps working — that decoupling means the parser engine can change without breaking visitor consumers.
- All AST nodes are deeply readonly, all collections are arrays in declaration order, no Map/Set/sort. Walker emits children via childrenOf(node) which is a switch over kind with assertNever as default — exhaustiveness flagged at compile time.
- VariableDeclarator is structural data on VariableDecl, NOT a walkable ASTNode (no kind discriminator). Visitors needing declarator names read .declarations directly inside an onNode handler. JSX inside a VariableDecl initializer is therefore not reached by walk(); a separate ExpressionStatement-style fixture verifies the JSXElement classification path.
- SWC's Import callee for dynamic import('./x') is mapped to a synthetic Identifier{name:'import'} — uniform pattern matching for Wave 5b-3 / T066 dynamic-import detection.
- import.meta is a leaf ImportMeta node (SWC MetaProperty with kind:'import.meta'). MemberExpression(object:ImportMeta, property:Identifier{name:'url'}) is the asset-edge pattern.
- ImportDeclaration → ImportDecl, ExportDeclaration → ExportDecl rename for consistency with FunctionDecl/ClassDecl. Existing tests updated.

Forbidden-strings gate now also rejects INSTANCE_EXPORT_SENTINEL per IMP-DEBT-08. The literal is constructed by concatenation in ast-kinds.test.ts to avoid tripping the SC-17 scanner against the test file itself.

Tests: 20 new in ast-kinds.test.ts (3 type-level, 1 sentinel-absence, 4 walker, 12 adapter integration). Repo total now 454 active + 2 skipped (was 432 + 5). All gates exit 0: build, typecheck (forced fresh), lint, test, forbidden-strings, forbidden-fallow-env, verify-wasm.

Next dispatch is Phase 3c.4 Dispatch B (T063-test + T064): single-pass typed visitor — HIGH RISK with 700 LOC budget across visitor/{index,declarations,usages,imports}.ts. Replaces original Fallow's 4-pass INSTANCE_EXPORT_SENTINEL pipeline with a typed accumulator. Spec: docs/superpowers/plans/02-phase-3c-3d-3e.md lines ~503-~620. Working tree clean as of 21617b3.