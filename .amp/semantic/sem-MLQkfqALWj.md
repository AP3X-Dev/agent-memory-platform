---
id: sem-MLQkfqALWj
confidence: 0.9
signal_count: 0
decay_class: stable
tags:
  - project:fugazi
  - architecture
  - determinism
  - cache
created_at: "2026-04-30T10:29:05.766Z"
updated_at: "2026-04-30T10:29:05.766Z"
---

Original Fallow uses path-sorted FileIds (ADR-004) so cross-run identity is stable. Must preserve this for cache validity in the TS port.