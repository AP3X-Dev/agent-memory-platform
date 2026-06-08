---
id: rHlBv3Yn16z1GckZtrZiA
session_id: session-20260419-210400
agent_id: mcp
task: [project:ap3x-solana] Task 20: solana-portfolio CLI correction tool
outcome: approved
created_at: "2026-04-20T04:03:58.086Z"
---

[project:ap3x-solana] Completed Task 20 for @ap3x/solana-portfolio. Added ap3x-portfolio CLI binary with correct-basis subcommand. Key decisions: (1) tsup.config.ts updated to include both src/index.ts and src/cli.ts entries; tsup automatically preserves the #!/usr/bin/env node shebang in the ESM output. (2) package.json gained ./cli export and bin field. (3) cli.test.ts uses execSync to smoke-test the built dist/cli.js — on Windows, path.resolve('packages/solana-portfolio') from within the package cwd produces a doubled path; fixed by using import.meta.url + fileURLToPath to derive pkgRoot from the test file's own location. (4) No eslint issues on new files — the repo has no no-console rule. All 7 lint warnings are pre-existing in reconciler.test.ts. Build: dist/cli.js (ESM, 5.43 KB) + dist/cli.cjs. Test: 1/1 green. Typecheck: clean. Commit: d62b3a2.