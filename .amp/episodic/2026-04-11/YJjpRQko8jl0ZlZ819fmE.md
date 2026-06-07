---
id: YJjpRQko8jl0ZlZ819fmE
session_id: session-20260410-probing-extractors
agent_id: mcp
task: [project:agent-assist-cr] Add extract_answer() to probing_fast_match.py — Task 2 of probing fast-match feature
outcome: approved
created_at: "2026-04-11T02:30:46.951Z"
---

[project:agent-assist-cr] Implemented extract_answer(text, question_type) -> Optional[str] in src/engine/probing_fast_match.py. Added 11 compiled regex patterns at module level covering: unsure detection (runs first for all types), yes_no positive/negative, age numeric + qualitative, location answer, count numeric + word-mapped, and type_brand with 3 sub-patterns in priority order (brand > fuel > type). Age normalisation strips trailing 's' then re-adds to produce consistent "{N} {unit}s" format. Word map for count converts spoken numbers to digits. Added from typing import Optional import. TDD: tests written first (27 new tests in TestAnswerExtractors), confirmed ImportError failure, implemented, all 50 tests in file pass, full suite 618/618 pass. Committed as feat(probing): add type-specific answer extractors for fast match.