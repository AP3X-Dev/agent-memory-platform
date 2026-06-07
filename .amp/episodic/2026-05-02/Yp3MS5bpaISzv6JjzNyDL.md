---
id: Yp3MS5bpaISzv6JjzNyDL
session_id: session-20260502-paper-pnl-link
agent_id: mcp
task: [project:cerebro] Reverse-proxy Node dashboards under apache port 80 to fix port-7777 access
outcome: approved
created_at: "2026-05-02T18:39:55.714Z"
---

[project:cerebro] Cerebro server (192.168.0.25) front-end is Apache on port 80, NOT the Node cerebro-control on port 7777. The user-facing landing page is /var/www/html/index.html (root-owned, edit with sudo). Edits there go live immediately — Apache serves static.

Direct ports 7777 (cerebro-control) and 7878 (paper-pnl-dashboard) are bound to 0.0.0.0 and reachable from cerebro itself, but the user reported they don't load from their browser. Symptom suggests their network/browser only allows port 80 to that host.

Fix: configured Apache reverse-proxy in /etc/apache2/sites-enabled/000-default.conf:
  ProxyPass /control/ http://127.0.0.1:7777/ + ProxyPassReverse
  ProxyPass /pnl/ http://127.0.0.1:7878/ + ProxyPassReverse
  RedirectMatch permanent ^/control$ /control/ (and same for /pnl) so non-trailing-slash URLs work.

This required `a2enmod proxy proxy_http`. Restart apache2 after enabling.

For this to work the Node apps' HTML must use RELATIVE URLs:
  - fetch('/api/...') breaks → use fetch('api/...')
  - <img src='/cerebro.png'> breaks → use src='cerebro.png'
Edited both cerebro-control.js and paper-pnl-dashboard.js to use relative paths in their served HTML/JS.

Final URLs:
  http://192.168.0.25/         — landing page (static)
  http://192.168.0.25/control/ — cerebro-control proxied
  http://192.168.0.25/pnl/     — paper-pnl-dashboard proxied
Direct port URLs (:7777, :7878) still work locally for debugging.

Pattern: when adding a new Node dashboard service, add a ProxyPass block + use relative URLs in served HTML so it works behind the apache proxy.