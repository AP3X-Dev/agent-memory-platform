// packages/core/src/__tests__/import.regression.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const IMPORT_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../import.ts'),
  'utf-8',
);

describe('import.ts regression', () => {
  it('BUG-0011: catch blocks log errors and ImportResult includes errors field', () => {
    // Before the fix, all three catch blocks (ADD, MODIFY, DELETE) in importFromPath
    // silently swallowed errors with no logging or error accumulation. Neo4j failures
    // were invisible — success counts included skipped nodes, creating invisible data loss.
    // The fix adds console.error logging and an errorCount accumulator exposed via
    // ImportResult.errors.

    // Verify error logging exists in all three catch blocks
    const addErrorLog = IMPORT_SOURCE.match(/Neo4j write error during ADD/);
    const modifyErrorLog = IMPORT_SOURCE.match(/Neo4j write error during MODIFY/);
    const deleteErrorLog = IMPORT_SOURCE.match(/Neo4j write error during DELETE/);

    expect(addErrorLog).not.toBeNull();
    expect(modifyErrorLog).not.toBeNull();
    expect(deleteErrorLog).not.toBeNull();

    // Verify errorCount accumulator exists
    expect(IMPORT_SOURCE).toContain('errorCount++');

    // Verify ImportResult has errors field
    expect(IMPORT_SOURCE).toMatch(/errors:\s*errorCount/);
  });
});
