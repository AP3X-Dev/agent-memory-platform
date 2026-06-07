---
id: FUxgExPBlmTxtkhueXPbF
session_id: scribo2-screen-aware-dictation-2026-04-09
agent_id: mcp
task: [project:scribo-2] Wire screen-aware dictation with pre-screenshot context
outcome: approved
created_at: "2026-04-10T15:03:52.553Z"
---

[project:scribo-2] Wired screen-aware dictation into the voice cleanup pipeline. Added screenshot_uri parameter to processor::cleanup() and updated try_groq_cleanup() to build its own text-only body instead of cloning the OpenRouter body (since Groq doesn't support multimodal). When screenshot_uri is present, cleanup uses the vision_model and sends multimodal content (text + image_url) to OpenRouter. The system prompt gets an extra instruction about using the screenshot as context without transcribing it. In lib.rs, added pre-screenshot capture using screenshotter::capture_active_window() gated by config.screen_aware_enabled, placed after tone detection and before cleanup call.