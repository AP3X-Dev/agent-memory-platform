// packages/neo4j/src/index.ts
export { createNeo4jDriver, healthCheck } from './driver.js';
export type { Neo4jHealthResult } from './driver.js';
export { initSchema, verifySchema } from './schema.js';
export type { SchemaVerification } from './schema.js';
export { EpisodicStore } from './episodic.js';
export { SemanticStore } from './semantic.js';
export { ProvenanceTraversal } from './provenance.js';
export type { ProvenanceNode } from './provenance.js';
export { ScopedQuery, validateReadOnlyCypher } from './query.js';
export type { QueryScope } from './query.js';
export { GDSAlgorithms } from './gds.js';
export { BlockStore } from './blocks.js';
export { FactStore } from './fact.js';
export { EntityResolver } from './entity-resolver.js';
export type { ResolvedEntity } from './entity-resolver.js';
export type { SimilarPair, RankedNode, CommunityNode } from './gds.js';
