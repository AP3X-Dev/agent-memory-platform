---
id: E4Wb-Uc2q_aukAOMkfAtn
session_id: session-20260606-amp-gitignore
agent_id: mcp
task: [project:amp] Assess difficulty of rebranding AMP → MemBerry across the monorepo
outcome: approved
created_at: "2026-06-07T01:39:38.359Z"
---

[project:amp] Ran a 14-agent audit (7 surface-finders + 6 adversarial verifiers + synth) on the feasibility of rebranding AMP → MemBerry. Verdict: ~4-5 engineer-days, mostly mechanical, with ~70% of risk in two spots. Key VERIFIED facts (some overturned earlier assumptions):
1. Neo4j graph needs ZERO migration — runtime node IDs use neutral prefixes (nanoid, sem-/ep-/fact-/ent-/sym-/src-/aspect-/exp-); the amp-* IDs in the repo are only docstring/test fixtures. Biggest de-risking fact.
2. Nothing is published to npm (all packages private:true, no publishConfig/release tooling) → @amp/* scope rename is purely internal.
3. Redis is NOT all-ephemeral (corrected an earlier wrong assumption): persistent no-TTL namespaces amp:feedback:* (learned ranking), amp:consolidation-queue, amp:signals + amp:episodic-buffer streams, amp:proposals:pending would be ORPHANED if the amp: prefix changes. Recommendation: keep amp: Redis prefix as an internal token.
4. The drift-guard test (packages/mcp/src/__tests__/server.test.ts) is a CODE↔CODE check (registered tools == gateway maps), NOT a docs check — it will NOT catch stale '49 tools' doc counts. Docs must be updated manually.
5. Wiki round-trip is a hard on-disk format: <!-- amp:sem-… --> anchors + amp_id: frontmatter are baked into hardcoded regexes (renderers.ts, viewer.ts, reconcile.ts) and consumed by 89 already-compiled pages (137 anchors, 154 amp_id). Keep emitting amp:/amp_id; dual-read only.
6. Tool names are not the only external contract: also the MCP server KEY 'amp' in ~/.claude/.mcp.json (drives mcp__amp__* namespace), the 'amp' CLI bin, and AMP_* env prefix. Strategy: register berry_* as canonical + keep amp_* as hidden deprecated aliases via an alias loop at end of registerAllTools() in packages/mcp/src/server.ts; env vars via readEnv(new,old) shim; amp:// dual-accept; keep .mcp.json server key 'amp' to avoid breaking the namespace. Recommended tool prefix: berry_ (shorter than memberry_). Full file-anchored plan saved to docs/rebrand-memberry-plan.md (gitignored). NOT YET EXECUTED — awaiting user decisions on prefix/tagline/repo-rename.