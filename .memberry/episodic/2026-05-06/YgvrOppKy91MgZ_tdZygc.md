---
id: YgvrOppKy91MgZ_tdZygc
session_id: session-20260505-localopt-12
agent_id: mcp
task: [project:oni-code] local opt session 12: complete Item #12 - responsive shell + a11y harness gates
outcome: approved
created_at: "2026-05-06T01:40:37.348Z"
---

[project:oni-code] AG3NT responsive + a11y gates done (commit ed40323 on opt/oni-local-agent-productionization). Layout decision: workspace shell now uses flex-col lg:flex-row so the chat sidebar stacks above the main pane on viewports below Tailwind's lg breakpoint (1024px). Sidebar width is carried via CSS variable `--ag3nt-sidebar-w` set inline from sidebarWidth state and consumed by the Tailwind class lg:w-[var(--ag3nt-sidebar-w)] — that preserves the drag-resize behavior on desktop without inline `width:` overriding w-full at narrow widths. Sidebar height is h-[42vh] lg:h-full so chat stays usable when stacked, and the resize handle is hidden:lg:block (only available when side-by-side). A11y: resize handle now exposes role="separator", aria-orientation="vertical", aria-label="Resize sidebar". Send/Settings/Preview/Code/Planning are reachable by accessible name via getByRole. Harness coverage: a11y test asserts each accessible name and the separator role; multi-viewport test runs open-calculator at desktop 1440x900, tablet 1024x768, mobile 390x844, asserts Settings/composer remain in viewport, scrolls each tab into view to assert reachability, validates sidebar bounding box switches from side-by-side to stacked at <lg, and writes screenshots to AG3NT UI/tests/screenshots/<viewport>-WxH.png. Screenshot dir is gitignored. Gates green: typecheck, lint, build, full Vitest 187/1427/1 skipped, ag3nt:harness 17/17.