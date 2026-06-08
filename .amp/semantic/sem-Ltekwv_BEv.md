---
id: sem-Ltekwv_BEv
confidence: 0.95
signal_count: 0
decay_class: stable
tags:
  - project:fugazi
  - config
  - file-discovery
created_at: "2026-04-30T10:29:05.819Z"
updated_at: "2026-04-30T10:29:05.819Z"
---

Hidden directory traversal in original Fallow allowlists .storybook, .vitepress, .well-known, .changeset, .github (ADR-006). Other dotdirs are skipped. Must preserve this list verbatim or behavior diverges on real projects.