// bench/membench/scenarios.ts
// The MemBench suite. Each scenario sets up a memory state and probes one dimension.
// Ground truth is human-judged on relevance/currency, independent of any system's mechanics.

import type { Scenario } from './types.js';

let t = 0;
const at = () => ++t; // monotonically increasing logical timestamps

export const SCENARIOS: Scenario[] = [
  // ── 1. Recall: surface the items that answer the query ──
  {
    name: 'project-fact-recall',
    dimension: 'recall',
    description: 'Repo facts an agent stored; probes must retrieve the right ones.',
    items: [
      { id: 'r-pnpm', text: 'This project uses pnpm, not npm, for all package management.', ts: at(), kind: 'fact' },
      { id: 'r-routes', text: 'API routes live in apps/web/src/app/api.', ts: at(), kind: 'fact' },
      { id: 'r-prisma', text: 'Never edit generated Prisma client files under node_modules/.prisma.', ts: at(), kind: 'instruction' },
      { id: 'r-service', text: 'Use the existing service layer instead of calling the database directly.', ts: at(), kind: 'instruction' },
      { id: 'r-docker', text: 'Integration tests require Docker Compose to be running.', ts: at(), kind: 'fact' },
      { id: 'r-noise1', text: 'The marketing site favicon is a blue hexagon.', ts: at(), kind: 'fact' },
      { id: 'r-noise2', text: 'The office wifi password rotates monthly.', ts: at(), kind: 'fact' },
    ],
    probes: [
      { query: 'what package manager does this project use', k: 3, relevant: ['r-pnpm'] },
      { query: 'where do the api routes live', k: 3, relevant: ['r-routes'] },
      { query: 'how do I run the integration tests', k: 3, relevant: ['r-docker'] },
    ],
  },

  // ── 2. Precision: few relevant among many distractors (noise control) ──
  {
    name: 'precision-under-distractors',
    dimension: 'precision',
    description: 'High-leverage context must dominate; do not pad with loosely-related noise.',
    items: [
      { id: 'p-auth', text: 'Authentication uses JWT bearer tokens validated on every request.', ts: at(), kind: 'fact' },
      { id: 'p-login', text: 'The login endpoint issues a signed JWT and a refresh token.', ts: at(), kind: 'fact' },
      { id: 'p-d1', text: 'The payment service retries charges with exponential backoff.', ts: at(), kind: 'fact' },
      { id: 'p-d2', text: 'Rate limiting uses a token-bucket throttle per client id.', ts: at(), kind: 'fact' },
      { id: 'p-d3', text: 'Logs are structured JSON with a correlation id.', ts: at(), kind: 'fact' },
      { id: 'p-d4', text: 'The cache layer uses Redis with a 60s TTL.', ts: at(), kind: 'fact' },
      { id: 'p-d5', text: 'Deployments run via the pnpm deploy pipeline.', ts: at(), kind: 'fact' },
    ],
    probes: [
      { query: 'how does authentication work', k: 2, relevant: ['p-auth', 'p-login'] },
    ],
  },

  // ── 3. Conflict / knowledge-update: current truth must outrank the superseded fact ──
  {
    name: 'conflict-resolution',
    dimension: 'conflict',
    description: 'Jest→Vitest and deploy-command updates: prefer current repo truth over stale.',
    items: [
      { id: 'c-jest-old', text: 'The project uses Jest as its test runner.', ts: at(), kind: 'decision', invalidated: true },
      { id: 'c-vitest', text: 'The project migrated to Vitest; all tests run with vitest.', ts: at(), kind: 'decision', confidence: 0.9 },
      { id: 'c-npm-old', text: 'Deploys run via npm run ship.', ts: at(), kind: 'decision', invalidated: true },
      { id: 'c-pnpm', text: 'Deploys now run via the pnpm deploy pipeline with rolling restarts.', ts: at(), kind: 'decision', confidence: 0.9 },
    ],
    probes: [
      { query: 'what test runner does the project use', k: 3, relevant: ['c-vitest'], stale: ['c-jest-old'], current: 'c-vitest' },
      { query: 'how do we deploy to production', k: 3, relevant: ['c-pnpm'], stale: ['c-npm-old'], current: 'c-pnpm' },
    ],
  },

  // ── 4. Stale-resistance: invalidated items must not pollute the top context ──
  {
    name: 'stale-resistance',
    dimension: 'stale',
    description: 'Several superseded facts coexist with current ones; the top context must stay current.',
    items: [
      { id: 's-cur-db', text: 'The database is PostgreSQL 16 on the primary cluster.', ts: at(), kind: 'fact', confidence: 0.9 },
      { id: 's-old-db', text: 'The database was MySQL on a single node.', ts: at(), kind: 'fact', invalidated: true },
      { id: 's-old-db2', text: 'We used SQLite for the prototype database.', ts: at(), kind: 'fact', invalidated: true },
      { id: 's-cur-queue', text: 'Async work runs on a Redis-backed queue.', ts: at(), kind: 'fact', confidence: 0.85 },
      { id: 's-old-queue', text: 'Async work used to run on RabbitMQ.', ts: at(), kind: 'fact', invalidated: true },
    ],
    probes: [
      { query: 'what database does the project use', k: 3, relevant: ['s-cur-db'], stale: ['s-old-db', 's-old-db2'] },
      { query: 'how is async work processed', k: 2, relevant: ['s-cur-queue'], stale: ['s-old-queue'] },
    ],
  },

  // ── 4b. IMPLICIT conflict: no invalidated flag — staleness must be INFERRED from a
  //        newer contradicting fact on the same subject (the realistic case). ──
  {
    name: 'implicit-conflict-inference',
    dimension: 'conflict',
    description: 'Newer fact contradicts an older one with NO stale flag; infer current truth.',
    items: [
      { id: 'i-rl-old', text: 'The API rate limit is 100 requests per minute per client.', ts: at(), kind: 'fact' },
      { id: 'i-noise-a', text: 'The API returns JSON with a correlation id header.', ts: at(), kind: 'fact' },
      { id: 'i-rl-new', text: 'The API rate limit is now 1000 requests per minute per client after the upgrade.', ts: at(), kind: 'fact' },
      { id: 'i-node-old', text: 'The service runs on Node 18.', ts: at(), kind: 'fact' },
      { id: 'i-node-new', text: 'The service was upgraded and now runs on Node 22.', ts: at(), kind: 'fact' },
    ],
    probes: [
      // No `stale`/`invalidated` marking — the system must infer i-rl-old is superseded by the newer i-rl-new.
      { query: 'what is the api rate limit', k: 2, relevant: ['i-rl-new'], stale: ['i-rl-old'], current: 'i-rl-new' },
      { query: 'what node version does the service run on', k: 2, relevant: ['i-node-new'], stale: ['i-node-old'], current: 'i-node-new' },
    ],
  },

  // ── 4c. Multi-hop recall: a query whose answer needs two distinct facts. ──
  {
    name: 'multi-hop-recall',
    dimension: 'recall',
    description: 'Answer requires combining two distinct stored facts.',
    items: [
      { id: 'm-token', text: 'Auth tokens are stored in an httpOnly cookie named sid.', ts: at(), kind: 'fact' },
      { id: 'm-expiry', text: 'Session tokens expire after 30 minutes of inactivity.', ts: at(), kind: 'fact' },
      { id: 'm-d1', text: 'The frontend is built with React and Vite.', ts: at(), kind: 'fact' },
      { id: 'm-d2', text: 'Images are served from a CDN.', ts: at(), kind: 'fact' },
      { id: 'm-d3', text: 'The CI runs on GitHub Actions.', ts: at(), kind: 'fact' },
    ],
    probes: [
      { query: 'how are sessions stored and when do they expire', k: 2, relevant: ['m-token', 'm-expiry'] },
    ],
  },

  // ── 5. Contamination: project-scoped recall must not bleed across projects ──
  {
    name: 'cross-project-isolation',
    dimension: 'contamination',
    description: 'Two projects share topics; a scoped query must return only the in-scope project.',
    items: [
      { id: 'x-web-auth', text: 'Auth uses NextAuth with session cookies.', ts: at(), project: 'web', kind: 'fact' },
      { id: 'x-api-auth', text: 'Auth uses JWT bearer tokens verified by middleware.', ts: at(), project: 'api', kind: 'fact' },
      { id: 'x-web-db', text: 'The web app reads from a read-replica via Prisma.', ts: at(), project: 'web', kind: 'fact' },
      { id: 'x-api-db', text: 'The api writes to the primary Postgres via the repository layer.', ts: at(), project: 'api', kind: 'fact' },
      { id: 'x-web-deploy', text: 'The web app deploys to Vercel.', ts: at(), project: 'web', kind: 'fact' },
      { id: 'x-api-deploy', text: 'The api deploys as a systemd unit on the cluster.', ts: at(), project: 'api', kind: 'fact' },
    ],
    probes: [
      { query: 'how does auth work', k: 2, project: 'api', relevant: ['x-api-auth'] },
      { query: 'how does deployment work', k: 2, project: 'web', relevant: ['x-web-deploy'] },
    ],
  },
];
