---
id: fcVk6Tk8sSTGhwNI5DNfU
session_id: session-20260502-paper-pnl-link
agent_id: mcp
task: [project:cerebro] Diagnose cerebro-control loading-screen hang
outcome: approved
created_at: "2026-05-02T19:29:38.437Z"
---

[project:cerebro] cerebro-control.js gotcha: the entire HTML/CSS/JS is served as one large template literal `const HTML = \`...\`;`. Inside a template literal, `\'` collapses to a bare `'` — the backslash is consumed. So embedded JS string concatenations like `'onclick="fn(\'' + id + '\', this)"'` get served as `'onclick="fn('' + id + '', this)"'`, which is a SYNTAX ERROR at parse time (the parser sees `str + ident + str` then encounters another `'` opening a new string with no operator between).

Symptom: the loading overlay never hides because init() runs in a script that fails to parse, so init() never executes.

Fix pattern: when embedding a JS string-quote inside a template literal that itself emits JS code, use double-backslash: `\\'` in source → `\'` in served output → valid escape inside the inner JS string.

This kind of bug is invisible to a server-side smoke test (curl gets 200 + valid HTML) — only manifests in the browser as a console SyntaxError. Diagnose with `chromium --headless --enable-logging=stderr --dump-dom <url>` and grep stderr for "Uncaught" / "SyntaxError".

Apply the same scrutiny when adding any new JS-emitting strings inside the cerebro-control HTML template — same trap exists for `\"`, `\n`, `\t`, etc.