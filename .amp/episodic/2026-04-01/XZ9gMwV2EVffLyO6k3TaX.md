---
id: XZ9gMwV2EVffLyO6k3TaX
session_id: deepgram-streaming-design-2026-03-31
agent_id: mcp
task: [project:agent-assist-cr] Must Book vs Demand Service — architectural insight for future refactor
created_at: "2026-04-01T20:47:57.116Z"
---

[project:agent-assist-cr] Key insight from user: Must Book is not a competing classification to Demand Service. It's a booking METHOD that the agent can choose.

Current behavior: job_type field tries to be both service category AND booking method. gpt-5.4 legitimately flip-flops between Must Book and Demand Service because both are correct — the call IS demand service, AND it qualifies for must-book booking.

Correct model: job_type should be the service category (Demand Service, Maintenance, Estimate). must_book_eligible should be a separate boolean flag. The SOP matcher already has must_book_rule_matched — it just shouldn't be a job_type value.

Impact: probing questions are loaded by trade_job_type key (e.g., "HVAC_Must Book"). Separating must_book from job_type would require restructuring probing_questions.json keys and the checklist loader.

Current workaround: Lock streak bumped to 4 consecutive matches. SOP engine independently surfaces must-book alerts from client SOP regardless of pipeline's job_type classification.

Future refactor: Split job_type and must_book_eligible. Touches: SopMatchResult model, sop_matcher prompt, probing_questions.json key structure, probing_loader.get_question_list(), pipeline_applicator checklist building.