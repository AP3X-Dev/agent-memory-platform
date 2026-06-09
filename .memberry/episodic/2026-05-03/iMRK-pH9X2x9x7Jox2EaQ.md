---
id: iMRK-pH9X2x9x7Jox2EaQ
session_id: autonomous-fugazi-2026-05-02
agent_id: mcp
task: [project:fugazi] Phase 4a T304+T305 complete — Python parser adapter + Inventory visitor at e35f195
outcome: approved
created_at: "2026-05-03T16:35:31.818Z"
---

[project:fugazi] Phase 4a T304+T305 landed at commit e35f195 on phase-3-foundation. Single commit, 39 new tests (15 adapter + 24 inventory). Test count 1886 → 1925. All 7 baseline gates exit 0.

Adapter (T304) at packages/extract/src/parsers-py/adapter.ts converts tree-sitter Python tree → discriminated-union AST (kinds-py.ts shape). Decorators detected via decorated_definition wrapper (tree-sitter's actual encoding, NOT sibling-based as initially assumed). Async via anonymous-child scan (async def is function_definition with leading async token, not separate node type). Cleanly mapped: function_definition (sync+async), class_definition, decorated_definition, import_statement, import_from_statement (level+module+names+wildcard), expression_statement → Assign/AnnAssign/AugAssign/ExpressionStmt, if/elif/else folded, for/while+else, try/except/finally with handlers, with/async with via with_clause/with_item/as_pattern, match/case, return/raise/yield (stmt+expr forms with from flag), pass/break/continue. Expressions: call, attribute, subscript, binary_operator, comparison_operator, unary_operator, not_operator, boolean_operator flattened, named_expression (Walrus), lambda, all comprehensions, tuple/list/dict/set literals with **other DictEntry + dictionary_splat, list_splat/dictionary_splat → Starred, await, yield expr, conditional_expression, parenthesized_expression unwrap, expression_list → Tuple, concatenated_string, f-strings with interpolation. Constants: integer/float/true/false/none/string. Falls through to UnknownStatement/UnknownExpression for: nonlocal, global, assert, delete, print, exotic patterns.

Visitor (T305) at packages/extract/src/visitor-py/{index,declarations,imports,usages,types}.ts produces Inventory{ lang:'py', declarations, imports, usages }. Underscore-prefix heuristic for exported (T306 will refine with __all__). Walrus binding suppression on onLeave. Comprehension target bindings folded into body[] without target names — identifier-usages still fire for x in [x for x in xs]; annotated as v1 limitation. For-loop tuple targets collapse target to '' (single-target works correctly). Sort+freeze on emit; single walkPy() call confirmed.

Limitations carried to later T-tasks: T306 __all__ extraction + wildcard per-name details. T307 TYPE_CHECKING block awareness (no kind:'type' import classification yet). T331 rule-layer TypedDict/Protocol/TypeAlias detection (visitor emits variable-decl). BigInt integers collapse to Number (precision loss for ints > MAX_SAFE_INTEGER). Wildcard from x import * surfaces as ImportFromStmt with names:['*'] at AST layer; visitor emits single Import with source:'x' (per-name * info deferred). 

Phase 4a status: T301 ✓ (575495c WASM spike), T302+T303 ✓ (d0f6688 cross-lang Inventory + kinds-py + walker), T304+T305 ✓ (e35f195 adapter + visitor). Remaining 4a: T306-T315 (__all__ extraction, TYPE_CHECKING blocks, suppression, complexity, cache integration, property tests).