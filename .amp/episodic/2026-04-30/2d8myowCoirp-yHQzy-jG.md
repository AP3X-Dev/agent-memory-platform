---
id: 2d8myowCoirp-yHQzy-jG
session_id: session-20260430-014700
agent_id: mcp
task: [project:fugazi] Scope correction: no paywall, all features free
outcome: approved
created_at: "2026-04-30T11:14:47.168Z"
---

[project:fugazi] CRITICAL SCOPE CORRECTION. The whole reason for the clean-room rewrite is to ship Fallow's currently-paid features for free. Fugazi has NO paywall, NO license verification, NO grace ladder, NO sidecar signing infrastructure (or at least none gated by license). The runtime-intelligence features (hot/cold paths, runtime-weighted health, stale-flag evidence, trends, alerts, runtime-backed review) are first-class FREE features in Fugazi. Drop: crates/license, fallow license subcommand (activate/status/refresh/deactivate), FALLOW_LICENSE env var, the second Ed25519 key for sidecar signing, MCP's "where licensed" conditional. Keep: the runtime collection mechanism + V8 ScriptCoverage parser + Istanbul normalizer + the analytical features built on top. Design the runtime sidecar wire format from scratch since fallow-cov-protocol is closed-source. Earlier seed prior "License grace ladder must be ported exactly" (sem about license-pkg) is now CONTRADICTED — drop that direction entirely.