---
id: ZQJsvZdjPaZUhOM4x30zv
session_id: autonomous-prp-1-foundation-2026-04-18
agent_id: mcp
task: [project:chad-gpt] PRP-1 brainstorming session: foundation design for Chad GPT by AP3X modernization
outcome: approved
created_at: "2026-04-19T06:11:44.866Z"
---

[project:chad-gpt] Foundation PRP brainstormed and approved (commit 6211e4d, updates in a8f67ee). Spec at docs/superpowers/specs/2026-04-18-chad-gpt-foundation-design.md.

KEY DECISIONS:
- Architecture: standalone Node + Fastify + AP3X service replaces Python FastAPI + LangGraph (option B in Q4)
- Runtime: @ap3x/core v1.0.0 (rebrand of @oni.bot/core, published today by user)
- Default model: Anthropic Claude Sonnet 4.6, OpenAI + OpenRouter as fallbacks
- Persistence (PRP-1 only): SqliteCheckpointer; upgrade to Postgres in PRP-5/6
- Monorepo: pnpm workspaces; turbo for orchestration; eslint-boundaries for bounded-context enforcement
- Branding: Chad GPT by AP3X
- Internal package namespace: @ap3x/chad-* (user owns @ap3x scope)
- pump-gateway gets @ap3x/pump-gateway from day one (intended for eventual extraction/publication)
- UI rebrand + widget dispatch refactor (markdown markers -> typed SSE events)
- CI matrix: Ubuntu + Windows
- Markets in scope: Solana DEXs + meme-coin sniping + pump.fun launches (option D in Q7a)
- Strategy authoring (PRP-3+): hybrid DSL + TS sandbox (option C in Q7b)
- Solana primitives package scope: comprehensive C - rug/honeypot detection, LP locks, dev clustering, Jito, priority fees (PRP-2 deliverable)

LOAD-BEARING IMPLEMENTATION PRINCIPLE (added by user mid-design):
Vertically integrated slices. Each slice (capability) is fully wired end-to-end through every layer (shared types -> integration client -> tool -> graph node -> router -> SSE event -> UI widget mount -> tests -> parity check) BEFORE the next slice begins. Each slice must meet six "complete" criteria: fully wired e2e / functional / optimized / cleanly architected / tested at every layer / maintainable. CI green at every slice boundary. No layered horizontal builds. See spec section 10.1.

PRP-1 SLICE SEQUENCE:
0. Scaffold + scaffold-only smoke test (pnpm dev boots empty backend + UI rebranded shell)
1. Token analysis (DexScreener+Birdeye+Jupiter parallel -> DexScreenerWidget)
2. Wallet analysis (Helius + Moralis MCP -> MoralisWidget)
3. Polymarket markets (Gamma+CLOB with clobTokenIds direct path -> PolymarketWidget)
4. Pump.fun feeds (PROVES @ap3x/pump-gateway extraction-readiness via standalone-server CI test)
5. LLM research fallback (Exa MCP + Jupiter trending)
6. Phase 0 diagnostic against now-real integrations
7. Parity runner + CI on Ubuntu/Windows
8. Migration + docs (Python -> .archive/backend-python/)

USER TRAJECTORY: personal use (A) -> private beta (B) -> internal team (D) -> public SaaS (C). PRP-1 ships milestone A only; architecture must permit later milestones without rewrites but not implement them.

ROADMAP: PRP-1 foundation (this) -> PRP-2 @ap3x/solana primitives -> PRP-3 @ap3x/strategy backtest engine -> PRP-4 multi-agent strategy researcher (uses @ap3x/swarm + @ap3x/a2a) -> PRP-5 observability+guardrails -> PRP-6 private beta hardening -> PRP-7 HITL trade execution -> PRP-8 SaaS readiness.

EXTERNAL APIS / MCP IN USE: DexScreener, Birdeye, Jupiter, Polymarket Gamma+CLOB, Magic Eden, Helius RPC, pump.fun feed, Moralis MCP, Helius MCP, Exa MCP. User has not used the platform in months so true working state is unknown - Phase 0 diagnostic resolves this before implementation commits to anything.

EXECUTION MODE: solo + agent-driven (autonomous-advisor invoked next). Full autonomous pipeline for first pass. User wants to see where things land before committing to ongoing autonomy.

GIT STATE AT BRAINSTORMING END:
- 6211e4d docs: add PRP-1 foundation design spec for Chad GPT by AP3X
- a8f67ee chore: initial baseline of pre-modernization codebase (also includes vertical-slice spec update)