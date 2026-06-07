---
id: nxDtxzzzGd2RJTBjrRfEp
session_id: session-20260505-localopt-10
agent_id: mcp
task: [project:oni-code] local opt session 10: complete Item #10 - convert AG3NT from CDN/Babel prototype to a bundled frontend
outcome: approved
created_at: "2026-05-06T01:24:05.769Z"
---

[project:oni-code] AG3NT productionization Item #10 done (commit 324d18a on opt/oni-local-agent-productionization). Architecture decision: chose esbuild+tailwindcss CLI over Vite to keep the build pipeline declarative and free of a dev-server runtime. Bundle layout: tailwindcss compiles AG3NT UI/src/styles.css -> AG3NT UI/assets/build/ag3nt.css; AG3NT UI/scripts/build-js.mjs runs esbuild's JSX transform on each component file individually and writes flat `assets/build/components/*.js` + `app.js` outputs that match the script tags in AG3NT UI/AG3NT UI.html. Build outputs are gitignored under AG3NT UI/assets/build/. React stays as UMD <script> in the HTML for now - acceptance criterion was "no Tailwind CDN or Babel standalone in production HTML", which is met without bundling React. Root npm run build now invokes ag3nt:build after workspace builds, so a single command produces the full app artifact set. The Playwright harness has a regression test that fails if Tailwind CDN or Babel standalone reappear in the production shell. Gates green: typecheck, build, lint, test (187 files / 1427 / 1 skipped), ag3nt:harness (12 tests).