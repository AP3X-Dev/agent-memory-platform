---
id: sem-tcgUjKmRmt
confidence: 0.6
signal_count: 0
decay_class: stable
tags:
  - project:ap3x-core
  - performance
created_at: "2026-04-20T14:10:03.179Z"
updated_at: "2026-04-20T14:10:03.179Z"
---

Token streaming uses AsyncLocalStorage for per-node handler isolation; hot paths should minimize ALS push/pop to hit p99 <5ms gate