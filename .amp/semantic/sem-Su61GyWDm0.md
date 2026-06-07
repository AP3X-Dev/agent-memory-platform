---
id: sem-Su61GyWDm0
confidence: 0.9
signal_count: 0
decay_class: stable
tags:
  - project:oni-core
  - data-storage
created_at: "2026-04-30T06:43:53.751Z"
updated_at: "2026-04-30T06:43:53.751Z"
---

SqliteCheckpointer ships with journal_mode=WAL + synchronous=NORMAL since v1.0.0 but historically lacked busy_timeout (default 0)