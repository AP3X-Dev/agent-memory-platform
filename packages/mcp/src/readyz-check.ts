import { pathToFileURL } from 'node:url';

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface ReadyzCheckOptions {
  url: string;
  token?: string;
  timeoutMs: number;
  intervalMs: number;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function buildReadyzCheckOptions(env: Record<string, string | undefined> = process.env): ReadyzCheckOptions {
  const protocol = env['AMP_READYZ_PROTOCOL'] ?? 'http';
  const host = env['AMP_READYZ_HOST'] ?? '127.0.0.1';
  const port = env['MCP_PORT'] ?? env['PORT'] ?? '3101';
  const url = env['AMP_READYZ_URL'] ?? `${protocol}://${host}:${port}/readyz`;

  return {
    url,
    token: env['AMP_API_TOKEN'],
    timeoutMs: positiveInt(env['AMP_READYZ_TIMEOUT_MS'], 15_000),
    intervalMs: positiveInt(env['AMP_READYZ_INTERVAL_MS'], 500),
  };
}

export async function waitForReadyz(options: ReadyzCheckOptions): Promise<void> {
  if (!options.token) {
    throw new Error('AMP_API_TOKEN is required for authenticated /readyz checks');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const deadline = now() + options.timeoutMs;
  let lastFailure = 'no response';

  while (true) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new Error(`AMP /readyz did not return 200 within ${options.timeoutMs}ms (${lastFailure})`);
    }

    try {
      const response = await fetchWithDeadline(fetchImpl, options.url, options.token, remainingMs);

      if (response.status === 200) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : String(err);
    }

    const waitMs = deadline - now();
    if (waitMs <= 0) {
      throw new Error(`AMP /readyz did not return 200 within ${options.timeoutMs}ms (${lastFailure})`);
    }

    await sleep(Math.min(options.intervalMs, waitMs));
  }
}

async function fetchWithDeadline(
  fetchImpl: FetchImpl,
  url: string,
  token: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return await Promise.race([
      fetchImpl(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function readyzCheckMain(env: Record<string, string | undefined> = process.env): Promise<void> {
  const options = buildReadyzCheckOptions(env);
  await waitForReadyz(options);
  console.error(`[amp-readyz] Ready: ${options.url}`);
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  readyzCheckMain().catch((err: unknown) => {
    console.error(`[amp-readyz] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
