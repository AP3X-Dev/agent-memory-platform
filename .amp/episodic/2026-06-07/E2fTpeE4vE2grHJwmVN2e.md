---
id: E2fTpeE4vE2grHJwmVN2e
session_id: session-20260607-packaging
agent_id: mcp
task: [project:amp] Hardening packaging/release: Dockerfile, compose, mcp manifest, scripts, systemd
outcome: approved
created_at: "2026-06-07T09:57:36.677Z"
---

[project:amp] Packaging-hardening finding: the wiki package is NOT compiled by the root build. tsconfig.build.json references only 9 of 10 packages (omits packages/wiki). A clean `npm run build` exits 0 but produces no packages/wiki/dist — so `node packages/mcp/dist/server.js` fails at import time because @memberry/wiki resolves (via its package.json exports.import) to ./src/index.ts, whose .ts files import sibling .js paths that don't exist. Two fixes are needed but both are outside the packaging-task file scope: (1) add `{ "path": "packages/wiki" }` to tsconfig.build.json references (forbidden — root tsconfig), and (2) wiki/package.json exports.import should point at ./dist/index.js not ./src/index.ts. Flag to maintainers; smoke.mjs will correctly report wiki dist missing.