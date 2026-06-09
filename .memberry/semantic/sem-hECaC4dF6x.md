---
id: sem-hECaC4dF6x
confidence: 0.95
signal_count: 0
decay_class: stable
tags:
  - project:agent-assist-cr
  - concurrency
  - concurrency
created_at: "2026-04-14T18:18:43.584Z"
updated_at: "2026-04-14T18:18:43.584Z"
---

SOPRegistry must acquire its three internal locks in the strict order sessions → links → poll; reversal risks deadlock