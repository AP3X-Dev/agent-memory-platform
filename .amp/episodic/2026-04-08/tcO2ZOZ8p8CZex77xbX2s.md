---
id: tcO2ZOZ8p8CZex77xbX2s
session_id: review-flags-ui-tasks-10-11-2026-04-08
agent_id: mcp
task: [project:agent-assist-cr] Implement Tasks 10-11: UI review flags for CustomerInfoComponent and FormQuestionsComponent
outcome: approved
created_at: "2026-04-08T22:05:24.043Z"
---

[project:agent-assist-cr] Implemented review flag UI indicators across the Electron renderer layer. Added 4 IPC entries in preload.js (acceptCustomerReviewFlag, dismissCustomerReviewFlag, acceptChecklistReviewFlag, dismissChecklistReviewFlag) and 4 matching handlers in main.js that POST to the FastAPI backend review-flag accept/dismiss endpoints. CustomerInfoComponent got _getReviewFlag() with composite key mapping (first_name/last_name -> name API field), _reviewFlagHtml() for rendering NEW badges and amber warning expand panels, and event listeners for toggle/accept/dismiss. FormQuestionsComponent got equivalent review flag rendering inline with confidence dots, using data-qid attributes. Renderer.js wires session IDs to both components via setSessionId() calls in handleAssistUpdate(). The expand panel shows suggested value, source utterance, and accept/dismiss buttons.