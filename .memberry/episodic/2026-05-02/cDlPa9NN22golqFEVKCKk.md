---
id: cDlPa9NN22golqFEVKCKk
session_id: session-20260502-paper-pnl-link
agent_id: mcp
task: [project:cerebro] Wire paper-pnl into kiosk + add mobile responsive CSS
outcome: approved
created_at: "2026-05-02T18:49:34.674Z"
---

[project:cerebro] Cerebro kiosk system architecture:

- /home/cerebro/projects/cerebro-kiosk/controller.js — kiosk-controller service on port 4300. Single source of truth for what the physical monitor displays. Exposes /api/pages, /api/current, /api/set/<id>.
- The PAGES array (line 24) is the registry. Add new entries with {id, label, icon, url}. Once added, the page appears in the mobile remote at /control AND can be set as the kiosk display via /api/set/<id>.
- /home/cerebro/projects/cerebro-kiosk/kiosk.sh — launches cage+chromium fullscreen pointed at http://localhost:4300/. The hub iframes whatever currentPage is.
- Setting a page via the remote effectively makes it a "screensaver" because the kiosk monitor will display it indefinitely until changed.

To add a dashboard to the kiosk: append to PAGES, restart cerebro-kiosk-controller.service. URL should be http://localhost:<port> for same-host services.

For mobile-responsive Node-served HTML dashboards, the conventional breakpoints used in this codebase are 760px (tablet/phone) and 420px (small phone). Standard tactics: stack grid rows to 1col, reduce header padding, drop logo subtitle, make tables horizontally scrollable with min-width preserved (e.g., min-width: 880px + overflow-x:auto on container) so column data stays readable rather than squashed.