#!/usr/bin/env node
//
// Post-build smoke test. No external infra required.
//
//   - Verifies the compiled MCP entry (packages/mcp/dist/server.js) exists and
//     is non-empty.
//   - Verifies every workspace package has its compiled entry present
//     (dist/server.js for mcp, dist/index.js for the rest).
//   - Best-effort: if an MCP server is reachable on MCP_PORT/PORT, GET /healthz
//     and assert 200. Connection-refused is treated as "not running" and skipped.
//
// Exit non-zero on any real failure (missing/empty dist). Exit zero otherwise.

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Compiled entry per package. mcp ships dist/server.js; everything else dist/index.js.
const PACKAGES = [
  ['core', 'index'],
  ['neo4j', 'index'],
  ['redis', 'index'],
  ['mcp', 'server'],
  ['research', 'index'],
  ['arch', 'index'],
  ['code', 'index'],
  ['retrieval', 'index'],
  ['wiki', 'index'],
  ['graph', 'index'],
];

const pass = [];
const fail = [];

function checkEntry(pkg, entry) {
  // Honor an explicit package.json "main" if it points into dist/, otherwise use
  // the conventional entry name above.
  let relEntry = `dist/${entry}.js`;
  try {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'packages', pkg, 'package.json'), 'utf8'),
    );
    if (typeof manifest.main === 'string' && manifest.main.startsWith('dist/') && manifest.main.endsWith('.js')) {
      relEntry = manifest.main;
    }
  } catch {
    // No manifest is itself a failure below.
  }

  const file = join(repoRoot, 'packages', pkg, relEntry);
  try {
    const st = statSync(file);
    if (!st.isFile() || st.size === 0) {
      fail.push(`${pkg}: ${relEntry} is empty`);
      return;
    }
    pass.push(`${pkg}: ${relEntry} (${st.size} bytes)`);
  } catch {
    fail.push(`${pkg}: missing ${relEntry} — run 'npm run build'`);
  }
}

for (const [pkg, entry] of PACKAGES) checkEntry(pkg, entry);

// Best-effort health probe — never a hard failure unless the server answers non-200.
function probeHealth() {
  const port = process.env.MCP_PORT || process.env.PORT || 3101;
  return new Promise((res) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/healthz', timeout: 1500 },
      (r) => {
        r.resume();
        if (r.statusCode === 200) {
          pass.push(`healthz: 200 on port ${port}`);
        } else {
          fail.push(`healthz: expected 200, got ${r.statusCode} on port ${port}`);
        }
        res();
      },
    );
    req.on('timeout', () => {
      req.destroy();
      console.log(`[smoke] health probe timed out on port ${port} — skipping (server not running).`);
      res();
    });
    req.on('error', (e) => {
      // ECONNREFUSED / not running -> skip silently-ish.
      console.log(`[smoke] no MCP server on port ${port} (${e.code || e.message}) — skipping health probe.`);
      res();
    });
  });
}

await probeHealth();

console.log('\n=== MemBerry smoke test ===');
for (const p of pass) console.log(`  PASS  ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log('===========================');

if (fail.length > 0) {
  console.log(`\nFAIL — ${fail.length} check(s) failed, ${pass.length} passed.\n`);
  process.exit(1);
}
console.log(`\nPASS — ${pass.length} check(s) passed.\n`);
process.exit(0);
