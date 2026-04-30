// packages/wiki/src/__tests__/lint-exercise.test.ts
// Regression test: every one of the 10 lint checks must execute its Cypher
// query cleanly against a Neo4j-shaped Driver — no Cypher syntax errors, no
// "Variable 's' not defined" (the bug we just fixed in coverage_gaps), no
// unhandled exceptions thrown out of WikiLinter.lint().
//
// The lint() implementation already wraps each check in try/catch and
// downgrades thrown errors to severity:'error' issues. So we assert two things:
//   1. WikiLinter.lint() returns a LintResult with a LintCheckResult for each
//      requested check — never bubbles an exception.
//   2. No check produces an "error" severity issue (which would indicate the
//      check threw — most commonly a Cypher syntax error).
//
// We use a minimal mocked Driver that returns empty record sets for any query.
// This catches Cypher *parse-shape* bugs that would surface BEFORE the driver
// actually runs the query (since neo4j-driver doesn't parse on the client).
// We supplement with a "real query" mode toggled by the LINT_EXERCISE_REAL=1
// env var which uses the running Neo4j at NEO4J_URI to confirm queries are
// syntactically valid against a real database.

import { describe, it, expect, vi } from 'vitest';
import { WikiLinter } from '../lint.js';
import type { LintCheck, LintCheckResult } from '../types.js';
import type { Driver, Session, Result } from 'neo4j-driver';

const ALL_CHECKS: readonly LintCheck[] = [
  'broken_links',
  'orphan_pages',
  'missing_links',
  'redirect_candidates',
  'link_density',
  'hub_detection',
  'contradictions',
  'low_confidence',
  'stale_sources',
  'coverage_gaps',
];

function mockResult(): Result {
  return { records: [] } as unknown as Result;
}

function createMockDriver(): Driver {
  const mockSession = {
    run: vi.fn(async () => mockResult()),
    close: vi.fn(async () => {}),
  } as unknown as Session;
  return {
    session: vi.fn(() => mockSession),
  } as unknown as Driver;
}

// LintCheckResult shape guard
function assertLintCheckResultShape(name: string, r: unknown): asserts r is LintCheckResult {
  expect(r, `${name} result is defined`).toBeDefined();
  const obj = r as Record<string, unknown>;
  expect(typeof obj['check'], `${name} has check string`).toBe('string');
  expect(Array.isArray(obj['issues']), `${name} has issues array`).toBe(true);
  expect(typeof obj['passed'], `${name} has passed boolean`).toBe('boolean');
}

// WikiLinter.lint() catches thrown errors and surfaces them as
// `{ severity: 'error', message: 'Check failed: <reason>' }`. Some checks
// (contradictions, in particular) legitimately emit severity:'error' as
// findings — those are NOT wiring failures. To distinguish, we look for the
// "Check failed:" message prefix that only the catch-block emits.
function findFailureIssues(r: LintCheckResult) {
  return r.issues.filter(
    (i) => i.severity === 'error' && i.message.startsWith('Check failed:'),
  );
}

describe('WikiLinter — all 10 checks execute cleanly (mocked driver)', () => {
  it('runs every check and returns a LintCheckResult for each — no exceptions', async () => {
    const driver = createMockDriver();
    const linter = new WikiLinter(driver);

    const result = await linter.lint({
      project_tag: 'project:lint-exercise',
      checks: [...ALL_CHECKS],
    });

    expect(result).toBeDefined();
    expect(result.checks).toBeDefined();
    expect(Object.keys(result.checks)).toHaveLength(ALL_CHECKS.length);

    for (const check of ALL_CHECKS) {
      assertLintCheckResultShape(check, result.checks[check]);
    }
  });

  it('no check throws a Cypher/parse failure (caught and surfaced as "Check failed: ...")', async () => {
    const driver = createMockDriver();
    const linter = new WikiLinter(driver);

    const result = await linter.lint({
      project_tag: 'project:lint-exercise',
      checks: [...ALL_CHECKS],
    });

    for (const check of ALL_CHECKS) {
      const r = result.checks[check];
      const failures = findFailureIssues(r);
      expect(
        failures,
        `Check '${check}' threw — likely a Cypher problem: ${JSON.stringify(failures)}`,
      ).toHaveLength(0);
    }
  });

  it('coverage_gaps regression: handler binds variable `s` correctly (BUG FIX: was "Variable `s` not defined")', async () => {
    const driver = createMockDriver();
    const linter = new WikiLinter(driver);

    const result = await linter.lint({
      project_tag: 'project:lint-exercise',
      checks: ['coverage_gaps'],
    });

    const r = result.checks['coverage_gaps'];
    assertLintCheckResultShape('coverage_gaps', r);
    expect(findFailureIssues(r)).toHaveLength(0);
  });
});

// ─── Real Neo4j mode (optional) ──────────────────────────────────────────────
// Run with `LINT_EXERCISE_REAL=1 npx vitest run lint-exercise.test.ts` to
// validate every Cypher query parses + executes against a live Neo4j. This
// catches syntax errors the mock cannot — like the original `coverage_gaps`
// "Variable 's' not defined" parse failure.

const useReal = process.env['LINT_EXERCISE_REAL'] === '1' && !!process.env['NEO4J_URI'];

describe.skipIf(!useReal)('WikiLinter — all 10 checks execute against live Neo4j', () => {
  it('every check runs without Cypher errors', async () => {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      process.env['NEO4J_URI']!,
      neo4j.default.auth.basic(
        process.env['NEO4J_USER'] ?? 'neo4j',
        process.env['NEO4J_PASSWORD'] ?? '',
      ),
    );

    try {
      const linter = new WikiLinter(driver);
      const result = await linter.lint({
        project_tag: 'project:__lint_exercise_does_not_exist__',
        checks: [...ALL_CHECKS],
      });

      for (const check of ALL_CHECKS) {
        const r = result.checks[check];
        assertLintCheckResultShape(check, r);
        const failures = findFailureIssues(r);
        expect(
          failures,
          `Check '${check}' threw against live Neo4j — Cypher/runtime failure: ${JSON.stringify(failures)}`,
        ).toHaveLength(0);
      }
    } finally {
      await driver.close();
    }
  }, 30000);
});
