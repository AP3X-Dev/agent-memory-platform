---
id: M1prcsDU_wNbpXUyMqnJf
session_id: autonomous-amp-wiki-cleanup-2026-04-29
agent_id: mcp
task: [project:amp] Autonomous triage complete — open items resolved
created_at: "2026-04-30T06:49:20.854Z"
---

[project:amp] Autonomous run on the wiki-overhaul open items, completed without human input. Results:

1. Bare ap3x → ap3x-core: confirmed via Desktop\AP3X\PRP-CORE.md ("Repo: ap3x-core/") that the 19 April-9 episodes (Phase 1-4a, @ap3x/core, @ap3x/runtime, @ap3x/server, packages/ui, packages/app monorepo work) describe the foundation of what's now ap3x-core. Migrated 19 episodes' scope/tags/text-prefix from project:ap3x to project:ap3x-core.

2. claude-code-main: KEEP. Single semantic claim (sem-Ufe4itgrNK at 0.4) is a genuine win-condition anchor: "outperforming Claude Code on every coding-agent metric that matters — loop discipline, tool quality, long-task reliability, native swarm orchestration." Description ("Anthropic's Claude Code — the bar to surpass on coding-agent metrics that matter") is accurate. Deleting would lose the explicit benchmark intent.

3. Bootstrapped 8 missing project Entity hierarchies:
   - amp (10 module entities matching packages/: arch, code, core, mcp, neo4j, oni, redis, research, retrieval, wiki) + 4 seed semantics + 47 rels
   - oni-core (a2a, community, integrations, loaders, stores, tools) + 3 semantics + 17 rels
   - oni-agent (src, skills) + 5 rels
   - gmgn-wallet-tracker (src, scripts, migrations, deploy) + 2 semantics + 26 rels
   - scribo-2 (renderer, tauri) + 1 semantic + 20 rels
   - tachi (core, runtime, server, ui, app) + 13 rels
   - ap3x-core (a2a, community, devtools, hot-loader, integrations, loaders, stores, tools) + 2 semantics + 35 rels
   - cic2 (pipeline, transcript, settings) + 56 rels
   Skipped: clean-room-skill (1 episode, low value).

4. Bootstrapped ap3x-solana with full module set (12 modules: @ap3x/solana-core/tx/connectivity/metaplex/spl/vault/events plus pump-gateway, pumpfun-feed, helius-rpc, polymarket-api, moralis-mcp + TokenStreaming) — connected 103 previously-orphaned cross-references.

5. Resolved contradiction at confidence 0.85: "Electron renderer is copied verbatim — any contract drift must be fixed backend-side via route aliases or response field duplication, never renderer-side" (sem-dYjHraya30) was directly contradicted by the 2026-04-15 v2 migration episode that explicitly edited src/electron/renderer/components/sop-panel.js to remove v1 fallback branches. Decayed to 0.15 with notes; stored successor claim with correction signal.

6. 13 low-confidence claims triaged: lifted 7 ap3x-solana architecture facts from 0.3 → 0.7 (they describe the actual codebase as built — bootstrap re-asserted them). Left 6 gpt-5.4 model-upgrade hypotheses at 0.3 (correct state — they're explicit research priors pending validation outcomes).

Wiki final state: 16 → 15 projects, 195 → 260 entities, 51 → 65 semantic facts, 465 → 467 session entries. Lint contradictions count: still 1 (the decayed-to-0.15 claim still has the contradiction signal, lint flags by signal presence not by current confidence). Lint low-confidence: 13 → 7. Lint broken_links count is misleading: most remaining flags are cross-project references (lint scopes broken_links per-project, so any cross-project entity reference fires) and project-root entities (the check expects every entity to have a CONTAINS parent, but project roots ARE the parent — design quirk in the lint).

Open items left for the user:
- Whether to extend Agent-Assist-CR's existing 17-entity hierarchy with the orphan modules referenced in semantics (SettingsService, Electron Renderer, AssistStateStore, DrainCoordinator, SessionManager, DualStreamCapture, DeepgramStreamClient, SOPRegistry).
- Whether to bootstrap chad-gpt's chad-core and chad-integrations as proper modules.
- Whether the lint design for broken_links should be loosened to not flag (a) project-root entities (no parent expected) and (b) cross-project references (an entity in project A being mentioned in project B's semantic isn't broken).</content>
<outcome>approved</outcome>
<entities>["amp", "ap3x-core", "ap3x-solana", "oni-core", "oni-agent", "gmgn-wallet-tracker", "scribo-2", "tachi", "cic2", "claude-code-main", "Agent-Assist-CR"]</entities>
<tags>["project:amp", "autonomous-run"]</tags>
</invoke>