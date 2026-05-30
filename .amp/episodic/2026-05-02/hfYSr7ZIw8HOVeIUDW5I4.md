---
id: hfYSr7ZIw8HOVeIUDW5I4
session_id: session-20260502-001
agent_id: mcp
task: [project:ap3x-signals] Monte Carlo discovery: original backtest was flawed, exploring evolutionary strategy optimization
outcome: revised
created_at: "2026-05-02T14:24:00.408Z"
---

[project:ap3x-signals] Critical discovery: T60 Elite Trail Monte Carlo (+58.9%) was based on flawed entry pricing. The backtest used alert.entry_price_usd (price at first fire/PRIMARY) but measured exits from PREMIUM post time — giving credit for moves that already happened. Corrected Monte Carlo shows the strategy loses money (-95% over 30 days) when using actual executable prices at PREMIUM post time.

Key data insight: alerts fire when 2 wallets converge, but PREMIUM diversity (3 tiers) often arrives minutes to hours later. The alpha is in the first 5 minutes after fire (55% win rate, 1.116 median ROI at fire-time entry with 5min hold). By 60 minutes, median ROI drops to 0.445.

Decision: pivot from fixed T60 strategy to evolutionary algorithm that discovers optimal entry timing, hold duration, and feature weighting from the 7.3-day GMGN dataset (4,966 alerts, 7.1M price snapshots, 48 features per signal). Data is rich enough for genetic optimization with proper train/val/test splits.