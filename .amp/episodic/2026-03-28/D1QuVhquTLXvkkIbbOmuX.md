---
id: D1QuVhquTLXvkkIbbOmuX
session_id: cic2-parity-2026-03-28
agent_id: mcp
task: [project:cic2] Parity: Time period detection — regular vs after-hours (9e, 9h)
outcome: approved
created_at: "2026-03-28T08:14:27.074Z"
---

[project:cic2] Wired hours_status and client_local_time from the backend SOP projection through to the frontend UI. The backend (runtime/sop/hours_status.py) already computed timezone-aware Regular Hours / After Hours detection using zoneinfo and returned it in the SOP projection payload. The gap was purely frontend: ChatStream.tsx and CallSopView.tsx had hardcoded "Regular Hours" green badges. Fix: added hoursStatus and clientLocalTime fields to the Zustand sopStore, threaded them through GuidelinesPanel to both ChatStream and CallSopView. Badge now shows green (#22C55E) for "Regular Hours" or red (#EF4444) for "After Hours" — matching CIC1's exact color scheme. Client local time is displayed alongside the timezone label. No Python changes needed.