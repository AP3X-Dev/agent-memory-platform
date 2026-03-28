// Type declarations for tree-sitter grammar packages that lack their own types.
// These are loaded dynamically in parser.ts — the shims let tsc compile without them installed.

declare module 'tree-sitter' {
  class Parser {
    setLanguage(language: unknown): void;
    parse(input: string): Parser.Tree;
  }
  namespace Parser {
    interface Tree {
      rootNode: SyntaxNode;
    }
    interface SyntaxNode {
      type: string;
      text: string;
      startPosition: { row: number; column: number };
      endPosition: { row: number; column: number };
      childCount: number;
      child(index: number): SyntaxNode | null;
      childForFieldName?(name: string): SyntaxNode | null;
    }
  }
  export default Parser;
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
