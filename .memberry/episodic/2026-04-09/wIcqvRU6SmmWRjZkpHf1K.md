---
id: wIcqvRU6SmmWRjZkpHf1K
session_id: phase1-task1-pnpm-monorepo-20260408
agent_id: mcp
task: [project:ap3x-core] Task 1: Initialize pnpm monorepo workspace
outcome: approved
created_at: "2026-04-09T04:55:18.866Z"
---

[project:ap3x-core] Converted from npm to pnpm monorepo. Created pnpm-workspace.yaml (packages/*), .npmrc (shamefully-hoist=true for CRA compat, strict-peer-dependencies=false). Updated root package.json: renamed to ap3x, added private:true, added typescript and vitest devDeps, added typecheck/test/test:watch scripts, added pnpm.onlyBuiltDependencies for electron/esbuild. Deleted package-lock.json, pnpm install created pnpm-lock.yaml. pnpm 10.14.0 requires interactive approve-builds for postinstall scripts -- workaround is manually running node install.js in electron/esbuild dirs, or adding pnpm.onlyBuiltDependencies to package.json. react-scripts 5.0.1 has peer dep warning for typescript 5.x (expects 3.x/4.x) -- non-breaking. Branch: phase-1/monorepo-core-types. Commit: e5687ac.