---
id: -pTBpsH7k3BK5H6jy23nE
session_id: oni-code-tui-20260401
agent_id: mcp
task: [project:oni-code] ONI Brand System TUI specifications — official color tokens and component inventory
outcome: approved
created_at: "2026-04-02T03:32:38.586Z"
---

[project:oni-code] ONI Brand System v1.0 — TUI section (Section 08) defines the official terminal identity.

KEY BRAND RULE: "The aggressive marketing red gives way to a state-driven semantic palette — green for life, purple for thought, cyan for output. The terminal is where ONI actually works."

DUAL IDENTITY:
- Marketing/Web: ONI Red #FF2E1F (sharp, aggressive, memorable)
- Product/TUI: Semantic palette (every color = agent state)

TUI COLOR TOKENS (official, ANSI Truecolor):
- primary: #00d46a — Prompt ❯, running state, cursor
- primaryShimmer: #33e880 — Spinner shimmer, animated accents
- secondary: #7c3aed — Model "thinking", tool calls in-flight
- secondaryShimmer: #a78bfa — Purple spinner shimmer
- accent: #80fff9 — Streamed agent output, links
- gold: #ea9a6a — Tool call names, HITL prompts, highlights
- text: #F0EDE8 — Primary body text
- textDim: #9E9BA0 — Labels, footer stats, metadata
- textMuted: #5C5A60 — Timestamps, decorative, disabled
- bg: #0F0F10 — Terminal floor, fullscreen bg
- success: #2DBE72 — Completed nodes, diffs added
- error: #FF2E1F — ONI Red re-emerges for errors only
- warning: #E8A820 — Warnings, permission overlays

UI SYMBOLS (official):
- ❯ (primary green) — user prompt
- ◈ (secondary purple) — tool call
- ◉ (accent cyan) — ONI logo mark
- ⚡ (gold) — permission request
- ✔ (success green) — done
- ✖ (error red) — failed
- ⚠ (warning gold) — warning
- → (textDim) — tool result
- │ (textDim) — diff marker
- · (textMuted) — swarm agent dot
- ⠸ (textDim) — spinner frame
- ↓ (textDim) — scroll indicator

BOX DRAWING:
- Standard (─ │ ┌ ┐ └ ┘): panels, cards, dividers
- Heavy (━ ┃ ┏ ┓ ┗ ┛): header bar, active focus, status bar
- Rounded (╭ ╮ ╰ ╯): modal/overlay containers

COMPONENT INVENTORY (from brand spec):
1. Header Bar — heavy border, top-anchored. Shows ◉ ONI, model, tokens, turns
2. Message Types — user (❯ green), tool call (◈ purple + gold name), output (cyan), diff (+green/-red), system (muted)
3. Spinner — state-driven color: primary=running, secondary=tool call, gold=permission, warning=HITL
4. Input Area — divider, ❯ prompt, cursor █, footer hints
5. Permission Overlay — rounded gold border, ⚡ header, [y]/[Y]/[n] options

ANSI TEXT STYLES:
- Bold \x1b[1m — headings, values
- Dim \x1b[2m — metadata, timestamps
- Italic \x1b[3m — use sparingly