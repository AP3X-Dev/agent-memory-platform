// packages/core/src/__tests__/hooks-managed-block.test.ts
import { describe, it, expect } from 'vitest';
import {
  replaceManagedBlock,
  stripManagedBlock,
  hasManagedBlock,
  BLOCK_BEGIN,
  BLOCK_END,
} from '../cli/managed-block.js';

describe('managed block', () => {
  it('appends a block to existing content, preserving it', () => {
    const out = replaceManagedBlock('# My Project\n\nHand-written notes.\n', 'BODY');
    expect(out).toContain('# My Project');
    expect(out).toContain('Hand-written notes.');
    expect(out).toContain(BLOCK_BEGIN);
    expect(out).toContain('BODY');
    expect(out).toContain(BLOCK_END);
  });

  it('is idempotent: replacing twice with the same body is byte-identical', () => {
    const base = '# Doc\n\ntext\n';
    const once = replaceManagedBlock(base, 'BODY-v1');
    const twice = replaceManagedBlock(once, 'BODY-v1');
    expect(twice).toBe(once);
  });

  it('replaces only the managed region, leaving surrounding content intact', () => {
    const base = replaceManagedBlock('# Doc\n\nkeep me\n', 'OLD');
    const updated = replaceManagedBlock(base, 'NEW');
    expect(updated).toContain('keep me');
    expect(updated).toContain('NEW');
    expect(updated).not.toContain('OLD');
    expect((updated.match(/MEMBERRY:BEGIN/g) ?? []).length).toBe(1);
  });

  it('replaces a legacy AMP: managed block in place (no duplicate)', () => {
    // A block written by a pre-rebrand version, with the old brand + command text.
    const legacy =
      '# Doc\n\nkeep me\n\n' +
      '<!-- AMP:BEGIN (managed by `amp context materialize` — do not edit by hand) -->\n' +
      'OLD BODY\n' +
      '<!-- AMP:END -->\n';
    const updated = replaceManagedBlock(legacy, 'NEW BODY');
    expect(updated).toContain('keep me');
    expect(updated).toContain('NEW BODY');
    expect(updated).not.toContain('OLD BODY');
    // Old block was matched + replaced with the new MEMBERRY marker — not duplicated.
    expect((updated.match(/:BEGIN/g) ?? []).length).toBe(1);
    expect(updated).toContain('MEMBERRY:BEGIN');
    expect(updated).not.toContain('AMP:BEGIN');
  });

  it('creates a block in an empty file', () => {
    const out = replaceManagedBlock('', 'BODY');
    expect(hasManagedBlock(out)).toBe(true);
  });

  it('strips the block and restores surrounding content', () => {
    const base = replaceManagedBlock('# Doc\n\nkeep me\n', 'BODY');
    const stripped = stripManagedBlock(base);
    expect(hasManagedBlock(stripped)).toBe(false);
    expect(stripped).toContain('keep me');
  });
});
