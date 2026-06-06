import { describe, it, expect } from 'vitest';
import { KeyedSerialQueue } from '../serial-queue.js';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedSerialQueue', () => {
  it('serializes work for the same key in FIFO order', async () => {
    const q = new KeyedSerialQueue();
    const order: string[] = [];

    // First task is slow, second fast — without serialization the fast one would
    // finish first. With serialization, FIFO is preserved.
    const p1 = q.run('k', async () => { await tick(30); order.push('first'); });
    const p2 = q.run('k', async () => { await tick(0); order.push('second'); });

    await Promise.all([p1, p2]);
    expect(order).toEqual(['first', 'second']);
  });

  it('runs different keys concurrently', async () => {
    const q = new KeyedSerialQueue();
    const order: string[] = [];

    const slow = q.run('a', async () => { await tick(30); order.push('a'); });
    const fast = q.run('b', async () => { await tick(0); order.push('b'); });

    await Promise.all([slow, fast]);
    // Different keys are not serialized, so the fast one (b) finishes first.
    expect(order).toEqual(['b', 'a']);
  });

  it('isolates failures: a rejected task does not block the next on the same key', async () => {
    const q = new KeyedSerialQueue();

    const failing = q.run('k', async () => { throw new Error('boom'); });
    const next = q.run('k', async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('returns the value of the queued function', async () => {
    const q = new KeyedSerialQueue();
    await expect(q.run('k', async () => 42)).resolves.toBe(42);
  });

  it('drains its key map once work settles (no unbounded growth)', async () => {
    const q = new KeyedSerialQueue();
    await q.run('k', async () => { await tick(0); });
    // Allow the finally-cleanup microtask to run.
    await tick(0);
    expect(q.activeKeys).toBe(0);
  });
});
