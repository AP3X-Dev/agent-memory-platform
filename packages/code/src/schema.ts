import { EMBEDDING_DIM } from "@memberry/core";
// packages/code/src/schema.ts
// Additive Neo4j schema for code intelligence.

import { type Driver } from 'neo4j-driver';

const CODE_CONSTRAINTS: string[] = [
  'CREATE CONSTRAINT symbol_id IF NOT EXISTS FOR (s:Symbol) REQUIRE s.id IS UNIQUE',
];

const CODE_INDEXES: string[] = [
  'CREATE INDEX symbol_file_path IF NOT EXISTS FOR (s:Symbol) ON (s.file_path)',
  'CREATE INDEX symbol_name IF NOT EXISTS FOR (s:Symbol) ON (s.name)',
  'CREATE INDEX symbol_kind IF NOT EXISTS FOR (s:Symbol) ON (s.kind)',
  'CREATE INDEX symbol_language IF NOT EXISTS FOR (s:Symbol) ON (s.language)',
  'CREATE INDEX symbol_content_hash IF NOT EXISTS FOR (s:Symbol) ON (s.content_hash)',
  'CREATE INDEX symbol_file_kind IF NOT EXISTS FOR (s:Symbol) ON (s.file_path, s.kind)',
  'CREATE INDEX symbol_name_kind IF NOT EXISTS FOR (s:Symbol) ON (s.name, s.kind)',
  'CREATE INDEX symbol_name_file_kind IF NOT EXISTS FOR (s:Symbol) ON (s.name, s.file_path, s.kind)',
];

const CODE_FULLTEXT: string[] = [
  'CREATE FULLTEXT INDEX symbol_search IF NOT EXISTS FOR (s:Symbol) ON EACH [s.name, s.signature, s.doc_comment]',
];

const CODE_VECTOR: string[] = [
  `CREATE VECTOR INDEX symbol_embedding IF NOT EXISTS FOR (s:Symbol) ON (s.embedding) OPTIONS {indexConfig: {\`vector.dimensions\`: ${EMBEDDING_DIM}, \`vector.similarity_function\`: 'cosine'}}`,
  "CREATE VECTOR INDEX symbol_lexical IF NOT EXISTS FOR (s:Symbol) ON (s.lexical_vector) OPTIONS {indexConfig: {`vector.dimensions`: 4096, `vector.similarity_function`: 'cosine'}}",
  "CREATE VECTOR INDEX symbol_mini IF NOT EXISTS FOR (s:Symbol) ON (s.mini_vector) OPTIONS {indexConfig: {`vector.dimensions`: 64, `vector.similarity_function`: 'cosine'}}",
];

export async function initCodeSchema(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const stmt of [...CODE_CONSTRAINTS, ...CODE_INDEXES, ...CODE_FULLTEXT, ...CODE_VECTOR]) {
      await session.run(stmt);
    }
  } finally {
    await session.close();
  }
}
