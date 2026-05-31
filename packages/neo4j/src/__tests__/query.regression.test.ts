// packages/neo4j/src/__tests__/query.regression.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ScopedQuery } from '../query.js';

describe('ScopedQuery.rawCypher regression', () => {
  it('enforces the caller limit even when user Cypher already includes a larger LIMIT', async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(session),
    };

    const query = new ScopedQuery(mockDriver as never);
    await query.rawCypher('MATCH (s:Semantic) RETURN s LIMIT 1000000', 25);

    expect(session.run).toHaveBeenCalledWith(
      expect.stringMatching(/RETURN \* LIMIT 25\s*$/),
      {},
    );
  });

  it('caps oversized caller limits before building the outer LIMIT', async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(session),
    };

    const query = new ScopedQuery(mockDriver as never);
    await query.rawCypher('MATCH (s:Semantic) RETURN s', 1000000);

    expect(session.run).toHaveBeenCalledWith(
      expect.stringMatching(/RETURN \* LIMIT 100\s*$/),
      {},
    );
  });

  it('passes parameter maps through to Neo4j session.run', async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(session),
    };
    const params = { grepPatternLower: "jwt' or 1=1", grepScope: "project:amp' or true" };

    const query = new ScopedQuery(mockDriver as never);
    await query.rawCypher(
      'MATCH (s:Semantic) WHERE toLower(s.content) CONTAINS $grepPatternLower AND $grepScope IN s.tags RETURN s',
      10,
      params,
    );

    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('$grepPatternLower'),
      params,
    );
  });

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
