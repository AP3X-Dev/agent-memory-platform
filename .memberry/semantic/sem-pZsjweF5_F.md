---
id: sem-pZsjweF5_F
confidence: 0.5
signal_count: 0
decay_class: stable
tags:
  - project:oni-code
  - persistence
  - persistence
  - session
created_at: "2026-04-12T14:47:05.255Z"
updated_at: "2026-04-12T14:47:05.255Z"
---

Session persistence is an append-only SQLite tree with parent_id lineage (pi-style); thread_id rebinds follow active execution via getThreadId thunks and onThreadIdChange callbacks