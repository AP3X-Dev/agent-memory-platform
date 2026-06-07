---
id: sem-nlW0ObqcqY
confidence: 0.7
signal_count: 0
decay_class: stable
tags:
  - project:fugazi
  - architecture
  - pipeline
created_at: "2026-04-30T10:29:05.664Z"
updated_at: "2026-04-30T10:29:05.664Z"
---

The original Fallow pipeline is: Config → File Discovery → Incremental Parallel Parsing (rayon + oxc_parser + oxc_semantic, cache-aware) → Script Analysis → Module Resolution (oxc_resolver) → Graph Construction → Re-export Chain Resolution → Dead Code Detection → Reporting.