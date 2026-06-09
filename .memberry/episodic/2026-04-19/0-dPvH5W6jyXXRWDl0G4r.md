---
id: 0-dPvH5W6jyXXRWDl0G4r
session_id: autonomous-prp-1-foundation-2026-04-18
agent_id: mcp
task: [project:chad-gpt] PRP-1 Slice 5 (LLM research fallback) complete
outcome: approved
created_at: "2026-04-19T10:10:07.092Z"
---

[project:chad-gpt] Slice 5 complete. 4 commits e8fa40b..fa76d3c. Tag slice-5-complete. 198 tests passing (up from 187).

WHAT GOT BUILT:
- JupiterClient.getTrending(window): hits lite-api.jup.ag/tokens/v2/toptrending/:window; lenient schema (catchall + all-optional) tolerates Jupiter iteration drift
- llm-research node: parallel Exa MCP web_search + Jupiter trending; composes evidence prompt; calls Anthropic claude-sonnet-4-6 via @ap3x/core/models; returns prose assistant message (no widget)
- Lazy model construction: anthropic() validates key at build time, so we defer construction until first research fire - graph build no longer requires ANTHROPIC_API_KEY for token/wallet/polymarket/pump paths
- Graph wiring: fast-path-router defaults to route=research when nothing else matches → llm_research → format → END. format is no-op for research (no widget to emit).
- BuildGraphOptions exposes llmResearchDeps for test injection (mock model + mock mcp + mock jupiter)
- 3 backend e2e scenarios: happy path (high confidence with both sources), Exa down (medium confidence), Slice 1 token regression

CONFIDENCE TIERS:
- high: exa ok + jupiter ok (both sources)
- medium: one source only (exa down or jupiter down)
- degraded: both sources down; model still called with "no external evidence" prompt

DESIGN DECISIONS:
- probeExa throws on available-but-failed (so Promise.allSettled captures as rejected → exa_mcp AgentError)
- probeExa returns null when mcp=null (so "not configured" doesn't log an error)
- Exa MCP tool name: tries web_search_exa first, falls back to web_search on tool-not-found (variant compatibility)
- System prompt externalized; 4000 char cap on evidence summary to stay under Claude's context budget at 1024 maxTokens
- Default 24h trending window (most relevant for meme-coin sniper/momentum use case)

NEW BACKLOG: none for Slice 5. No plan amendments triggered.

NEXT: Slice 6 (Phase 0 diagnostic). Runs all integration probes against real APIs; generates markdown + JSON report; each drift disposed as fix-now / defer-PRP-2 / drop. This is where Jupiter v6/price drift (noted in Slice 1) + Jupiter trending endpoint (added in Slice 5) get real-API verification.