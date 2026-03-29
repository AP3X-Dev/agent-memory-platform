// packages/neo4j/src/__tests__/query.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ScopedQuery } from '../query.js';

describe('ScopedQuery.rawCypher regression', () => {
  it('BUG-0001: rawCypher rejects mutating Cypher queries before reaching the database', async () => {
    // Before the fix, rawCypher passed user-supplied Cypher directly to Neo4j
    // with no sanitization. Any MCP client could execute destructive queries
    // like DETACH DELETE or CALL dbms.listConfig(). The fix adds
    // validateReadOnlyCypher() which throws on mutating keywords.

    const mockDriver = {
      session: vi.fn(),
    };

    const query = new ScopedQuery(mockDriver as never);

    // Destructive: wipe database
    await expect(query.rawCypher('MATCH (n) DETACH DELETE n', 10)).rejects.toThrow(
      /Cypher validation failed/,
    );

    // Credential exfiltration via stored procedure
    await expect(query.rawCypher('CALL dbms.listConfig()', 10)).rejects.toThrow(
      /CALL to a stored procedure/,
    );

    // Data mutation via CREATE
    await expect(query.rawCypher('CREATE (n:Pwned {data: "injected"})', 10)).rejects.toThrow(
      /mutating keyword "CREATE"/,
    );

    // session() should never have been called — validation happens before DB access
    expect(mockDriver.session).not.toHaveBeenCalled();
  });
});
