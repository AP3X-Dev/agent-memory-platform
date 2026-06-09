---
id: sem-kXOGxLS84l
confidence: 0.5
signal_count: 0
decay_class: stable
tags:
  - project:chad-gpt
  - architecture
  - bounded-context
  - vertical-slices
created_at: "2026-04-19T06:10:24.335Z"
updated_at: "2026-04-19T06:10:24.335Z"
---

pump-gateway must remain an extractable bounded context: zero imports from chat-core or apps/*. Enforced via eslint-boundaries. The day pump-gateway extracts to a standalone product is a packaging change, not a code rewrite.