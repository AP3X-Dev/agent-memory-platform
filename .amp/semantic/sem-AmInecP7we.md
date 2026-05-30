---
id: sem-AmInecP7we
confidence: 0.85
signal_count: 0
decay_class: stable
tags:
  - project:agent-assist-cr
  - architecture
  - concurrency
created_at: "2026-04-14T18:18:43.790Z"
updated_at: "2026-04-14T18:18:43.790Z"
---

Config is a frozen dataclass; runtime mutations flow through Config.with_overrides() returning a new immutable instance atomically swapped by SettingsService