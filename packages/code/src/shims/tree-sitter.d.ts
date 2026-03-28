// Type declarations for tree-sitter grammar packages that lack their own types.
// These are loaded dynamically in parser.ts — the shims let tsc compile without them installed.

declare module 'tree-sitter' {
  const Parser: any;
  export default Parser;
  export = Parser;
}

declare module 'tree-sitter-typescript' {
  export const typescript: unknown;
  export const tsx: unknown;
}

declare module 'tree-sitter-javascript' {
  const grammar: unknown;
  export default grammar;
}

declare module 'tree-sitter-python' {
  const grammar: unknown;
  export default grammar;
}

declare module 'tree-sitter-go' {
  const grammar: unknown;
  export default grammar;
}

declare module 'tree-sitter-rust' {
  const grammar: unknown;
  export default grammar;
}
