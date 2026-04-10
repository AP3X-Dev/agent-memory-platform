---
title: All Decisions
compiled: 2026-04-10
---

# Decisions

High-confidence claims and decisions across all projects, sorted by confidence.

## [[projects/mars-fps/_index|mars-fps]]

- mars-fps is a single HTML file game — all CSS, HTML, and JS live in mars-fps.html *(0.90)*
- HUD elements are inside <div id='hud'> and styled with inline CSS in the same file *(0.90)*

## Unscoped

- Hypothesis: Upgrading all stages to gpt-5.4 family models will fix Stage 2 reliability and improve overall accuracy. gpt-5.4 for Stage 2, gpt-5.4 for Stage 1, gpt-5.4-nano for Stage 3.
Changes: Mod... *(0.30)* -- **pipeline-accuracy-optimization**
- Hypothesis: Upgrading all stages to gpt-5.4 family models will fix Stage 2 reliability and improve overall accuracy. gpt-5.4 for Stage 2, gpt-5.4 for Stage 1, gpt-5.4-nano for Stage 3.
Changes: Mod... *(0.30)* -- **fact_extractor.py**
- Hypothesis: Reducing API pressure by gating SOP feed, skipping trivial chunks, and adding retry will prevent rate limits while maintaining acceptable latency.
Changes: Chunk size backed from 4s to... *(0.30)* -- **config.py**
- Hypothesis: The rate limit was TPM (tokens per minute) not RPM. Reducing SOP prompt from 33K to 10K chars on subsequent calls will eliminate rate limits.
Changes: SOP engine was sending full refere... *(0.30)* -- **sop_engine.py**
- Hypothesis: The rate limit was TPM (tokens per minute) not RPM. Reducing SOP prompt from 33K to 10K chars on subsequent calls will eliminate rate limits.
Changes: SOP engine was sending full refere... *(0.30)* -- **latency-reduction**
- Hypothesis: Reducing API pressure by gating SOP feed, skipping trivial chunks, and adding retry will prevent rate limits while maintaining acceptable latency.
Changes: Chunk size backed from 4s to... *(0.30)* -- **session_manager.py**
