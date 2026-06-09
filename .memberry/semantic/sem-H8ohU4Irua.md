---
id: sem-H8ohU4Irua
confidence: 0.5
signal_count: 0
decay_class: stable
tags:
  - project:fugazi
  - testing
  - testing-tools
created_at: "2026-04-30T10:29:05.988Z"
updated_at: "2026-04-30T10:29:05.988Z"
---

Original test suite uses insta snapshots, proptest property tests, and cargo fuzz. TS port should map these to: vitest for unit/snapshot, fast-check for property tests, and Jazzer.js for fuzzing (if pursued).