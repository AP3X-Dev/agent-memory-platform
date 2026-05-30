---
id: sem-yNvNajnh38
confidence: 0.7
signal_count: 1
decay_class: stable
tags:
  - project:ap3x-solana
  - api-design
  - substrate
  - decoder-framework
created_at: "2026-04-19T13:52:12.240Z"
updated_at: "2026-04-30T06:46:53.497Z"
---

Generic event decoder framework lives in solana-events; vertical packages register program-specific decoders via registerDecoder(programId, decoder); unknown variants emit typed UnknownEventDecode records, never silently dropped