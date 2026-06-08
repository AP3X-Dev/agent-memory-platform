---
id: sem-o9KtK6K38G
confidence: 0.5
signal_count: 0
decay_class: stable
tags:
  - project:fugazi
  - performance
  - ts-vs-rust-port
  - data-structure
created_at: "2026-04-30T10:29:05.722Z"
updated_at: "2026-04-30T10:29:05.722Z"
---

Original Fallow uses FxHashMap/FxHashSet exclusively for hot-path hashing — std HashMap is forbidden via .clippy.toml. The TS port should use plain Map/Set; rustc-hash equivalents in JS are not worth the complexity given V8's hash table is already fast.