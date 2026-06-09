---
id: sem-Po7hXilWiY
confidence: 0.9
signal_count: 0
decay_class: stable
tags:
  - project:agent-assist-cr
  - architecture
  - concurrency
  - api-design
created_at: "2026-04-14T18:18:43.517Z"
updated_at: "2026-04-14T18:18:43.517Z"
---

Services own their locks; callers never acquire them except through AssistStateStore.locked_update contextmanager