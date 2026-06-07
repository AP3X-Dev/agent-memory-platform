import { describe, expect, it, vi } from 'vitest';
import {
  buildReadyzCheckOptions,
  waitForReadyz,
} from '../readyz-check.js';

describe('readyz-check', () => {
  it('builds the readiness URL from service environment without exposing the token', () => {
    const options = buildReadyzCheckOptions({
      AMP_API_TOKEN: 'secret-token',
      MCP_PORT: '3101',
      AMP_READYZ_HOST: '127.0.0.1',
      AMP_READYZ_TIMEOUT_MS: '2000',
      AMP_READYZ_INTERVAL_MS: '100',
    });

    expect(options.url).toBe('http://127.0.0.1:3101/readyz');
    expect(options.token).toBe('secret-token');
    expect(options.timeoutMs).toBe(2000);
    expect(options.intervalMs).toBe(100);
  });

  it('prefers MEMBERRY_* env names over the legacy AMP_* fallback', () => {
    const options = buildReadyzCheckOptions({
      MEMBERRY_API_TOKEN: 'new-token',
      AMP_API_TOKEN: 'legacy-token',
      MEMBERRY_READYZ_HOST: 'new-host',
      AMP_READYZ_HOST: 'legacy-host',
      MCP_PORT: '3101',
    });

    // New name wins when both are present.
    expect(options.token).toBe('new-token');
    expect(options.url).toBe('http://new-host:3101/readyz');
  });

  it('sends the bearer token and resolves when readiness returns 200', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));

    await waitForReadyz({
      url: 'http://127.0.0.1:3101/readyz',
      token: 'secret-token',
      timeoutMs: 1000,
      intervalMs: 100,
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
    });

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:3101/readyz', expect.objectContaining({
      headers: { authorization: 'Bearer secret-token' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('retries transient non-ready responses until readiness succeeds', async () => {
    let clock = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await waitForReadyz({
      url: 'http://127.0.0.1:3101/readyz',
      token: 'secret-token',
      timeoutMs: 500,
      intervalMs: 100,
      fetchImpl,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails fast when no service token is available', async () => {
    await expect(waitForReadyz({
      url: 'http://127.0.0.1:3101/readyz',
      timeoutMs: 1000,
      intervalMs: 100,
      fetchImpl: vi.fn(),
    })).rejects.toThrow('MEMBERRY_API_TOKEN is required');
  });

  it('aborts a hung readiness request when the overall timeout expires', async () => {
    let clock = 0;
    let capturedSignal: AbortSignal | undefined;

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    await expect(waitForReadyz({
      url: 'http://127.0.0.1:3101/readyz',
      token: 'secret-token',
      timeoutMs: 100,
      intervalMs: 10,
      fetchImpl,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    })).rejects.toThrow('did not return 200');

    expect(capturedSignal?.aborted).toBe(true);
  });
});
