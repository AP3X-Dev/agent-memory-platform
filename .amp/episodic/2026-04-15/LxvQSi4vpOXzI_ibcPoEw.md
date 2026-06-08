---
id: LxvQSi4vpOXzI_ibcPoEw
session_id: session-20260415-uiparity-9
agent_id: mcp
task: [project:agent-assist-cr] UI parity session 9: H-2 combo + width-utility extraction
outcome: approved
created_at: "2026-04-15T19:38:49.631Z"
---

[project:agent-assist-cr] Session 9 closed H-2 (combo-pattern collapse) and extended via Mode B with width-utility extraction. Inline `style=""` count: 87 → 71 (−18% this session, total H-block ~−44% from 126 baseline).

**H-2 method:** Hand-rewrote 7 combo patterns (~22 instances) splitting `<utility>+width+(bg)` into `class="X" style="width:Npx"`. Initial count showed no drop — investigated and found the metric was misleading: each swap kept the `style=` attribute (now just `style="width:Npx"`), trading attribute volume for character volume. The real win was the bulk shift from selector-style to class names.

**Mode B insight that drove the win:** Recharacterizing the metric (count vs char volume + dominant pattern type) revealed that width-only attrs were the new top pattern (19 instances across 5 widths). Added 4 width utility classes (`.sop-w-90/120/140/200` for widths with 3+ uses) and folded 17 of 19 width attrs into class lists. This was the actual high-yield work this session — Mode B exceeded Mode A's impact.

**Convention — extraction threshold:** "only patterns with 3+ uses earn a utility class". CSS comment now codifies this. Prevents class-explosion as the loop continues — patterns with 1-2 uses stay inline. 11 utility classes total in sop-panel.css cover ~75% of inline-style usage; remaining 25% are genuine one-offs.

**Convention — Edit safety reaffirmed:** `replace_all: true` on `style="<exact pattern>"` is safe because the closing quote bounds the match. Bounded-edge substitutions = safe; partial substitutions (where order variants exist) = hand-rewrite required.

**H-3 filed (new — user decision required):** With 71 inline styles and 50 unique strings remaining, top patterns now max at 3 occurrences each. Continuing extraction means narrow single-purpose utilities — risk-reward inverts. H-3 needs user direction: (a) keep grinding to enable CSP tighten back to `'self'`, (b) accept current state and close Block H, (c) use SHA hash-allowlists in CSP.

**Loop trajectory observation — natural closure approaching:** 10 of 16 items completed in 9 sessions. Remaining: 3 user-or-backend-owned (D-1, F-1, G-1), 2 backend-blocked (E-1, E-2), Block C visual smoke (user-at-screen), H-3 (user direction). The autonomous loop has effectively zero unilateral work left. Next tick should either notify the user it's parked or pivot to a Mode-B-only audit (no clear candidate exists). Recommend telling the user the loop has hit its boundary.