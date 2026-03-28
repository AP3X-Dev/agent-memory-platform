// Type declarations for tree-sitter and grammar packages.
// Loaded dynamically in parser.ts — shims let tsc compile without them installed.

declare module 'tree-sitter' {
  namespace TreeSitter {
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
  class TreeSitter {
    setLanguage(language: unknown): void;
    parse(input: string): TreeSitter.Tree;
  }
  export = TreeSitter;
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
