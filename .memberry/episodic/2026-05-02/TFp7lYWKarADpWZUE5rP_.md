---
id: TFp7lYWKarADpWZUE5rP_
session_id: session-20260502-paper-pnl-link
agent_id: mcp
task: [project:cerebro] Finish wiring paper-pnl-dashboard link into cerebro-control center
outcome: approved
created_at: "2026-05-02T18:32:27.136Z"
---

[project:cerebro] Cerebro server architecture (192.168.0.25):

- /home/cerebro/cerebro-control.js — Control Center on port 7777. Single-file Node http server. Renders an HTML dashboard with grid cards. Reads /api/services to populate App Services card.
- /home/cerebro/paper-pnl-dashboard.js — Paper trading PnL dashboard on port 7878. Reads /home/cerebro/projects/ap3x-signals/tracker.db (sqlite). Returns HTML + /api/summary, /api/positions, /api/health endpoints.
- Both run as systemd units: cerebro-control.service and paper-pnl-dashboard.service.
- APP_SERVICES array in cerebro-control.js:13 is the registry — add new dashboards there with {id, label, port, icon}. The /api/services endpoint surfaces it; loadServices() at line ~1153 renders to #svc-manager div with clickable port links + restart buttons.

Bug fixed today: APP_SERVICES had the paper-pnl entry and loadServices() existed, but the renderFull() template never included the <div id="svc-manager"></div> container, so the link silently never rendered. Added an "App Services" span-2 card after the existing Services card containing that div. Restarted cerebro-control.service to pick up the change.

Pattern: when adding a new dashboard, register it in APP_SERVICES; the rendering already handles the rest as long as the svc-manager container exists.