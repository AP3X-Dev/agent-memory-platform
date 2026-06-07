// packages/neo4j/src/__tests__/validate-cypher.test.ts
import { describe, it, expect } from 'vitest';
import { validateReadOnlyCypher } from '../query.js';

describe('validateReadOnlyCypher', () => {
  // ── Should PASS (read-only queries) ──────────────────────────────────────

  it('allows simple MATCH/RETURN queries', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n:Semantic) RETURN n'),
    ).not.toThrow();
  });

  it('allows queries with WHERE clauses', () => {
    expect(() =>
      validateReadOnlyCypher(
        "MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: 'Foo'}) RETURN s.content, s.confidence ORDER BY s.confidence DESC",
      ),
    ).not.toThrow();
  });

  it('allows queries with LIMIT', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) RETURN n LIMIT 10'),
    ).not.toThrow();
  });

  it('allows queries with OPTIONAL MATCH', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (a:Entity) OPTIONAL MATCH (a)<-[:ABOUT]-(s:Semantic) RETURN a, s',
      ),
    ).not.toThrow();
  });

  it('allows queries with WITH and aggregation', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (s:Semantic) WITH s.confidence AS conf, count(*) AS cnt RETURN conf, cnt',
      ),
    ).not.toThrow();
  });

  it('allows queries with UNWIND', () => {
    expect(() =>
      validateReadOnlyCypher(
        "UNWIND ['a', 'b'] AS tag MATCH (s:Semantic) WHERE tag IN s.tags RETURN s",
      ),
    ).not.toThrow();
  });

  // ── Parameter names that resemble mutating keywords (BUG-0001 false positives) ──

  it('allows $SET parameter name without false positive', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n:Semantic) WHERE n.confidence > $SET RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows $DELETE parameter name without false positive', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n:Semantic) WHERE n.id = $DELETE RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows $REMOVE parameter name without false positive', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) WHERE n.flag = $REMOVE RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows $CREATE parameter name without false positive', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) WHERE n.type = $CREATE RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows $MERGE parameter name without false positive', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) WHERE n.name = $MERGE RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows $DROP parameter name without false positive', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) WHERE n.label = $DROP RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows multiple keyword-like parameter names in one query', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) WHERE n.a = $SET AND n.b = $DELETE AND n.c = $REMOVE RETURN n',
      ),
    ).not.toThrow();
  });

  // ── CALL {} subqueries (Neo4j 4.x+) ─────────────────────────────────────

  it('allows CALL {} subquery syntax', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) CALL { WITH n MATCH (n)-[:ABOUT]->(e) RETURN e } RETURN n, e',
      ),
    ).not.toThrow();
  });

  it('allows CALL {} with whitespace before brace', () => {
    expect(() =>
      validateReadOnlyCypher(
        'CALL  { MATCH (n) RETURN n } RETURN n',
      ),
    ).not.toThrow();
  });

  it('allows CALL {} on new line', () => {
    expect(() =>
      validateReadOnlyCypher(
        'CALL\n{ MATCH (n) RETURN n } RETURN n',
      ),
    ).not.toThrow();
  });

  // ── Mutating keywords inside string literals (should NOT trigger) ────────

  it('allows mutating keywords inside single-quoted strings', () => {
    expect(() =>
      validateReadOnlyCypher(
        "MATCH (n) WHERE n.name = 'DELETE ME' RETURN n",
      ),
    ).not.toThrow();
  });

  it('allows mutating keywords inside double-quoted strings', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) WHERE n.name = "SET value" RETURN n',
      ),
    ).not.toThrow();
  });

  // ── Mutating keywords inside comments (should NOT trigger) ───────────────

  it('allows mutating keywords inside line comments', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) RETURN n // DELETE this later',
      ),
    ).not.toThrow();
  });

  it('allows mutating keywords inside block comments', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH (n) /* CREATE nodes later */ RETURN n',
      ),
    ).not.toThrow();
  });

  // ── Should REJECT (mutating queries) ─────────────────────────────────────

  it('rejects CREATE', () => {
    expect(() =>
      validateReadOnlyCypher('CREATE (n:Test {name: "bad"})'),
    ).toThrow(/mutating keyword "CREATE"/);
  });

  it('rejects MERGE', () => {
    expect(() =>
      validateReadOnlyCypher('MERGE (n:Test {id: "x"})'),
    ).toThrow(/mutating keyword "MERGE"/);
  });

  it('rejects SET', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) SET n.name = "hacked"'),
    ).toThrow(/mutating keyword "SET"/);
  });

  it('rejects DELETE', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) DELETE n'),
    ).toThrow(/mutating keyword "DELETE"/);
  });

  it('rejects DETACH DELETE', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) DETACH DELETE n'),
    ).toThrow(/Cypher validation failed/);
  });

  it('rejects REMOVE', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) REMOVE n.prop'),
    ).toThrow(/mutating keyword "REMOVE"/);
  });

  it('rejects DROP', () => {
    expect(() =>
      validateReadOnlyCypher('DROP INDEX ON :Semantic(id)'),
    ).toThrow(/mutating keyword "DROP"/);
  });

  it('rejects FOREACH', () => {
    expect(() =>
      validateReadOnlyCypher(
        'MATCH p = (a)-[*]->(b) FOREACH (n IN nodes(p) | SET n.marked = true)',
      ),
    ).toThrow(/Cypher validation failed/);
  });

  it('rejects LOAD CSV', () => {
    expect(() =>
      validateReadOnlyCypher(
        "LOAD CSV FROM 'file:///data.csv' AS row CREATE (:Node {name: row[0]})",
      ),
    ).toThrow(/Cypher validation failed/);
  });

  it('rejects lowercase mutating keywords', () => {
    expect(() =>
      validateReadOnlyCypher('match (n) set n.x = 1'),
    ).toThrow(/mutating keyword "SET"/);
  });

  it('rejects mixed-case mutating keywords', () => {
    expect(() =>
      validateReadOnlyCypher('Match (n) Set n.x = 1'),
    ).toThrow(/mutating keyword "SET"/);
  });

  // ── CALL to stored procedures (should REJECT) ───────────────────────────

  it('rejects CALL to a stored procedure', () => {
    expect(() =>
      validateReadOnlyCypher('CALL db.index.vector.queryNodes("idx", 10, [1,2])'),
    ).toThrow(/CALL to a stored procedure/);
  });

  it('rejects CALL to apoc procedures', () => {
    expect(() =>
      validateReadOnlyCypher('CALL apoc.periodic.commit("MATCH (n) DELETE n", {})'),
    ).toThrow(/CALL to a stored procedure/);
  });

  it('rejects CALL with no braces (bare procedure name)', () => {
    expect(() =>
      validateReadOnlyCypher('CALL dbms.security.createUser("admin", "pass", false)'),
    ).toThrow(/CALL to a stored procedure/);
  });

  it('rejects SHOW administrative commands', () => {
    expect(() =>
      validateReadOnlyCypher('SHOW USERS'),
    ).toThrow(/administrative keyword "SHOW"/);

    expect(() =>
      validateReadOnlyCypher('USE system MATCH (n) RETURN n'),
    ).toThrow(/administrative keyword "USE"/);
  });

  // ── Hardening: homoglyphs, stacked statements, write-in-subquery ──────────

  it('folds fullwidth/compatibility homoglyphs (NFKC) and catches the keyword', () => {
    // Fullwidth "ＤＥＬＥＴＥ" normalizes to ASCII "DELETE" under NFKC.
    expect(() =>
      validateReadOnlyCypher('MATCH (n) ＤＥＬＥＴＥ n'),
    ).toThrow(/mutating keyword "DELETE"/);
  });

  it('rejects stacked statements (embedded semicolon)', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) RETURN n ; MATCH (m) RETURN m'),
    ).toThrow(/multiple statements/);
  });

  it('rejects a write hidden inside a CALL{} subquery', () => {
    // CALL{} subqueries are allowed, but a mutating keyword anywhere still trips.
    expect(() =>
      validateReadOnlyCypher('CALL { MATCH (n) DETACH DELETE n } RETURN 1'),
    ).toThrow(/mutating keyword/);
  });

  it('still allows a single trailing semicolon', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) RETURN n;'),
    ).not.toThrow();
  });

  it('rejects a write appended after a comment-terminated line', () => {
    expect(() =>
      validateReadOnlyCypher('MATCH (n) RETURN n // harmless\nCREATE (x)'),
    ).toThrow(/mutating keyword "CREATE"/);
  });
});
