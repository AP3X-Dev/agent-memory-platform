---
id: KduD6p2P9Nt3SVftr725K
session_id: session-20260514-workspace23
agent_id: mcp
task: [project:oni-grid] Workspace optimizer session 23: add conservative local port scanner command (item #20)
outcome: approved
created_at: "2026-05-14T22:30:23.229Z"
---

[project:oni-grid] Completed item #20 — new src-tauri/src/ports.rs scan_ports Tauri command + src/lib/portClient.ts. Key design: deliberately conservative per the optimizer's "if platform support is uneven, start with explicit config/run tracking" guidance — scan_ports probes a CALLER-SUPPLIED list of candidate ports via short-timeout TCP connect to 127.0.0.1:port (platform-agnostic std::net, no OS process-table walking, no range sweeps, no elevated perms). The frontend passes a workspace's expected ports so the scanner never invents one. ports.rs splits normalize_ports + is_port_open as testable helpers; Rust unit tests bind real ephemeral TcpListeners for deterministic open/closed assertions. portClient.scanPorts returns ObservedPort[] — the exact shape reconcileWorkspacePorts/observeWorkspacePorts (Session 21) consume, so the port pipeline is now end-to-end: scan → reconcile with config labels → store. The backlog title's "event update path" is satisfied by a polling seam (a later hook calls scanPorts on a cadence → observeWorkspacePorts) rather than a Tauri event emitter — polling a small known port list is simpler and sufficient for v1. Convention: testing network code in Rust — bind a real TcpListener on 127.0.0.1:0 for an ephemeral port, drop it to get a guaranteed-free port; avoids mocking sockets. Verification all green: TS 1916/1916, lint, tsc, cargo 167/167, clippy. Block 8 (ports + preview) underway.