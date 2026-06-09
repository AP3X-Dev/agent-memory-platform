---
id: sem-jjl9JrA1QX
confidence: 0.4
signal_count: 0
decay_class: stable
tags:
  - project:chad-gpt
  - architecture
  - roadmap
created_at: "2026-04-19T06:10:24.510Z"
updated_at: "2026-04-19T06:10:24.510Z"
---

Strategy authoring (PRP-3 onward) is hybrid: structured DSL for ~80% of patterns (sniper, momentum, liquidity-migration, whale-tracking) plus TS sandbox escape hatch for custom strategies. DSL evolution via parameter sweeps is cheap and safe; TS sandbox requires strict isolation.