---
id: sem-ZW2nuVVJt4
confidence: 0.4
signal_count: 0
decay_class: stable
tags:
  - project:fugazi
  - architecture
  - data-structure
  - ts-vs-rust-port
created_at: "2026-04-30T10:29:05.742Z"
updated_at: "2026-04-30T10:29:05.742Z"
---

Original Fallow stores graph edges in a flat Vec<Edge> with range indices for cache-friendly traversal (ADR-002). The TS port should evaluate whether typed arrays (Int32Array) give the same locality benefit, vs. a simpler Map<FileId, FileId[]> adjacency list.