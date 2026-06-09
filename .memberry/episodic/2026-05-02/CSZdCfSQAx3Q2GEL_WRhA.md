---
id: CSZdCfSQAx3Q2GEL_WRhA
session_id: session-20260502-001
agent_id: mcp
task: [project:ap3x-signals] Evolved paper strategy activated, replacing T60 Elite Trail
outcome: approved
created_at: "2026-05-02T17:14:53.454Z"
---

[project:ap3x-signals] Major strategy pivot: T60 Elite Trail retired, evolved-fixed-size-v2 activated.

Discovery: Original T60 Monte Carlo (+58.9%) was based on flawed entry pricing (used alert.entry_price_usd at fire time, measured exits from PREMIUM post time — gave credit for moves between PRIMARY and PREMIUM). Corrected backtest showed -95% loss.

Built evolutionary optimizer: @ap3x/core@1.3.0 (evolution subpath) + @ap3x/solana-trading@0.2.0 (backtester subpath). Ran 1.2M backtests across 48 evolution rounds with band-constrained stop/TP ranges. Found 217 strategies, 32 passing robust validation.

Key fixes to backtesting infrastructure:
- Portfolio replay with fixed sizing (not compounded ROI)
- Day-block bootstrap Monte Carlo (preserves intraday loss correlation)
- Quadratic drawdown penalty in fitness function
- Confirmation mode system (premium/elite post extends hold, disables TP)
- BacktestTrade carries entryTimeMs/exitTimeMs for realistic timing

Active strategy (evolved-fixed-size-v2): $100 trades, 2 max concurrent, 0s entry, 240m hold, 44.7% hard stop, 4.06x TP, 10% trailing after 1.9x activation. Gates: contributors >= 7.33, holders >= 189.51, no token ad, no trending-bar ad.

Packages published: @ap3x/core@1.3.0 (GeneticAlgorithm, SeededRng), @ap3x/solana-trading@0.2.0 (walkForwardExit, computeMetrics, runHistoricalMonteCarlo, replayPortfolio).