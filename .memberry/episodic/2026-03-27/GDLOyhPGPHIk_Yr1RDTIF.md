---
id: GDLOyhPGPHIk_Yr1RDTIF
session_id: cic2-planning-2026-03-27
agent_id: mcp
task: [project:cic2] Initial planning session — design spec and Phase 1 implementation plan
outcome: approved
created_at: "2026-03-27T18:29:29.508Z"
---

[project:cic2] CIC2 is a ground-up rebuild of the CIC Agent Assist call center platform.

STACK DECISIONS (LOCKED):
- Desktop shell: Tauri (Rust)
- Core runtime: Python (FastAPI + WebSockets on port 8742)
- UI: React + TypeScript + Vite
- Styling: Tailwind CSS + shadcn/ui — pixel-matching CIC1 design
- Database: SQLite with WAL mode
- Audio capture: PyAudioWPatch (WASAPI dual-stream)
- STT: OpenAI Whisper-1 via provider abstraction
- LLM: OpenAI GPT-4o-mini via provider abstraction
- IPC: WebSocket streaming + HTTP health/bootstrap
- Data assets: Copied from CIC1 at C:\Users\Guerr\Desktop\agent-assist-main

KEY ARCHITECTURAL DECISIONS:
- Event-sourced workflow coordination with SQLite-persisted projections
- Deterministic business logic first, LLM augmentation second
- 15 database tables defined (06-database-schema.md)
- WebSocket subscription model: snapshot + delta (07-api-contracts.md)
- Session state machine: idle → starting → recording → stopping → finalizing → completed
- Five9 integration planned for future — session model has nullable external_call_id, external_caller_phone, external_client_id fields

PROJECT STRUCTURE:
- Docs: C:\Users\Guerr\Desktop\CIC2\docs\ (planning docs + specs + plans)
- Design spec: docs/superpowers/specs/2026-03-27-cic2-rebuild-design.md
- Phase 1 plan: docs/superpowers/plans/2026-03-27-phase1-foundation.md
- ROADMAP.md: tracks all 62 tasks across 6 phases
- CIC1 source (reference): C:\Users\Guerr\Desktop\agent-assist-main

PHASE 1 PLAN: 17 tasks covering foundation — scaffolding, SQLite WAL, migrations, event log, WebSocket protocol, session state machine, UI shell layout, Tauri shell, roadmap tracking.

CIC1 UI DESIGN: Teal (#26A69A) primary, cyan (#2EB6D6) title bar, DM Sans font, 72px sidebar, 32px title bar, three-panel layout (transcript | agent assist | SOP guidelines), 1100x700 window.