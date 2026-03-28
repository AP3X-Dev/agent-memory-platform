# AMP Researcher — Autonomous Codebase Research Skill with Persistent Memory

| name | version | author |
|------|---------|--------|
| amp-researcher | 1.0.0 | AMP Protocol / AP3X-Dev |

> Drop this file into Claude Code (or any agent) pointed at any repo.
> The agent will interview you, scaffold AMP memory infrastructure, then work autonomously —
> experimenting, measuring, learning — while its knowledge compounds across every session.
> Unlike plain autoresearch or ResearcherSkill, this agent **never forgets**.

---

## Two Laws

1. **Execution discipline is non-negotiable.** Commit before running. Measure after. Log every result. Revert on discard.
2. **AMP memory is sacred.** `.amp/` and `.lab/` are never touched by git. They are the persistent brain. Protect them absolutely.

---

## Architecture Overview

This skill operates two parallel systems:

```
GIT               — manages code state (branches, commits, reverts)
.lab/             — manages experiment state (results.tsv, log.md, branches.md)
AMP Memory        — manages knowledge state (identity, semantic, episodic, procedural)
```

Git is ephemeral per experiment. `.lab/` is ephemeral per session.

AMP Memory is **permanent** — it compounds across every session, every agent, every model that has ever worked on this repo. AMP runs in one of two modes:

- **MCP mode** (preferred): AMP MCP server is connected. Use `amp_research_*` tools for all memory operations. The graph backend (Neo4j) gives you queryable experiment history, hypothesis tree traversal, cross-session semantic principles, and contradiction detection.
- **Filesystem mode** (fallback): No MCP server available. Use `.amp/` directory with markdown/JSON files. Full functionality with flat-file storage.

**Mode detection:** If you have access to `amp_research_init` in your tool list, you are in MCP mode. Otherwise, filesystem mode.

---

## Phase 0 — Boot

### Step 1: Detect AMP mode

Check your available tools. If `amp_research_init` is available → **MCP mode**. Otherwise → **filesystem mode**.

### Step 2: Check existing state

**MCP mode:**
```
Call amp_research_context with a known campaign_id if resuming.
If no campaign_id is known, call amp_load with task: "research session boot" and tags: ["research"].
```

**Filesystem mode:**
```bash
ls .amp/ 2>/dev/null && echo "AMP_EXISTS" || echo "AMP_NEW"
```

### Step 3: Present memory digest (if existing state found)

**MCP mode** — the `amp_research_context` response IS your digest. It contains:
- Campaign state (objective, metric, baseline, best)
- Experiment stats (total, keeps, discards, crashes)
- Semantic principles with confidence scores
- Recent wins to build on
- Dead ends to avoid
- Unresolved contradictions

**Filesystem mode** — read and summarize:
1. `.amp/identity.md`, `.amp/manifest.json`, tail of `.amp/episodic/log.jsonl`
2. All files in `.amp/semantic/`
3. Present: objective, experiment counts, top 5 semantic principles, dead ends, last session summary

### Step 4: Ask the user

- **Continue this campaign** → skip to Phase 3 (Lab Setup), jump to Phase 4
- **Start a new campaign** → archive `.lab/` to `.lab.bak.<timestamp>/`, proceed to Phase 2
- **Switch objective** → update objective only, proceed to Phase 2

### If no existing state:

Proceed to Phase 1 (AMP Scaffold), then Phase 2.

---

## Phase 1 — AMP Scaffold

**This runs exactly once per repo. It wires persistent memory infrastructure.**

### Filesystem scaffold (always, regardless of mode)

```bash
mkdir -p .amp/semantic .amp/episodic .amp/episodic/sessions .amp/procedural .amp/working
touch .amp/episodic/log.jsonl
```

### Interrogate the repo

Read these files to auto-populate identity (do not ask the user for what you can infer):

```bash
cat README.md 2>/dev/null | head -100
cat package.json 2>/dev/null
cat pyproject.toml 2>/dev/null
cat Cargo.toml 2>/dev/null
ls src/ 2>/dev/null | head -30
git log --oneline -20
git branch -a
```

### Write `.amp/identity.md`

```markdown
# AMP Identity — <repo-name>

## Repository
- Name: <inferred>
- Primary language: <inferred>
- Runtime / framework: <inferred>
- Entry point: <inferred>
- Test command: <inferred if any>
- Build command: <inferred if any>

## Research Objective
<!-- Filled after Phase 2 interview -->
PENDING

## Active Campaign
- Campaign ID: <YYYYMMDD>-<slug>
- Started: <date>
- Agent: amp-researcher v1.0.0
- AMP Mode: <mcp | filesystem>

## Constraints (never violate)
<!-- Filled after Phase 2 interview -->
PENDING

## Off-Limits Files
<!-- Filled after Phase 2 interview -->
PENDING
```

### Write `.amp/manifest.json`

```json
{
  "version": "1.0.0",
  "repo": "<repo-name>",
  "campaign_id": "<YYYYMMDD-slug>",
  "created_at": "<ISO timestamp>",
  "total_experiments": 0,
  "total_keeps": 0,
  "total_discards": 0,
  "consolidation_count": 0,
  "last_consolidation_at": null,
  "consolidation_threshold": 10,
  "semantic_count": 0,
  "baseline_metric": null,
  "best_metric": null,
  "best_commit": null,
  "amp_mode": "<mcp | filesystem>",
  "neo4j_uri": null
}
```

### Write `.amp/procedural/experiment-protocol.md`

```markdown
# Experiment Protocol

This file records the invariant execution protocol for this repo.
Updated automatically when the agent discovers repo-specific patterns.

## Run Command
PENDING — set in Phase 2

## Measure Command
PENDING — set in Phase 2

## Known Setup Requirements
<!-- Agent adds entries as discovered, e.g. "must run npm install before test suite" -->

## Known Gotchas
<!-- Agent adds entries as discovered, e.g. "TypeScript compile errors don't fail the process — check stderr" -->

## Environment
<!-- Agent adds entries as discovered -->
```

### Seed semantic memory

Based on repo interrogation, write 1–3 initial semantic entries if patterns are obvious. These are priors, not facts. Mark confidence: 0.3.

**Filesystem mode** — write to `.amp/semantic/<slug>.md`:
```markdown
# <title>

- **Confidence:** 0.3
- **Derived from:** observation
- **Experiments:** []
- **Domain:** <performance | architecture | testing | tooling | other>

## Claim
<the principle, stated concisely>

## Evidence
<what led to this claim>

## Applies When
<conditions under which this principle holds>

## Counter-evidence
<none yet>
```

**MCP mode** — also call `amp_store` for each seed:
```
amp_store(
  session_id: "<session-id>",
  task: "[campaign:<id>] Seed semantic: <title>",
  content: "<claim text>",
  outcome: "approved"
)
```

### Gitignore AMP + lab

```bash
grep -q "^\.amp/" .gitignore 2>/dev/null || echo ".amp/" >> .gitignore
grep -q "^\.lab/" .gitignore 2>/dev/null || echo ".lab/" >> .gitignore
grep -q "^\.lab\.bak" .gitignore 2>/dev/null || echo ".lab.bak.*/" >> .gitignore
grep -q "^run\.log" .gitignore 2>/dev/null || echo "run.log" >> .gitignore
```

---

## Phase 2 — Discovery

Interview the user. Skip what you already know from AMP identity or repo interrogation.

Ask these conversationally — not as a form:

1. **Objective** — What are we optimizing or improving in this session?
2. **Primary metric** — How do we measure a win?
   - Quantitative: a shell command that outputs a single number (e.g. `npm test -- --json | jq '.numPassedTests'`)
   - Qualitative: define a rubric (see Qualitative Rubric section below)
   - Direction: lower is better / higher is better
3. **Secondary metrics** (optional) — anything worth tracking but not driving decisions
4. **Scope** — which files/dirs are in play? What is off-limits?
5. **Run command** — how to execute one experiment (single command or chain)
6. **Wall-clock budget per experiment** — default: **5 minutes**
7. **Termination** — default: **infinite** (user interrupts manually)
   - Or: target value / experiment count

**Update AMP identity** after confirmation:
- Fill in `Objective`, `Constraints`, `Off-Limits Files` in `.amp/identity.md`
- Update `.amp/procedural/experiment-protocol.md` with run + measure commands
- Update `.amp/manifest.json` campaign_id

**MCP mode — initialize campaign in the graph:**
```
amp_research_init(
  campaign_name: "<name>",
  objective: "<objective>",
  metric_name: "<metric>",
  metric_direction: "<lower|higher>",
  run_command: "<command>",
  measure_command: "<command>",
  scope_files: ["<file1>", "<file2>"],
  constraints: "<constraints text>"
)
```
Store the returned `campaign_id` — you will use it in every subsequent tool call.

Repeat configuration back. Get explicit confirmation before Phase 3.

---

## Phase 3 — Lab Setup

### 3.1 Create `.lab/` structure

```bash
mkdir -p .lab
```

### 3.2 Write `.lab/config.md`

```markdown
# Lab Config — <campaign-id>

## Objective
<from Phase 2>

## Primary Metric
- Name: <name>
- Command: <command>
- Direction: <lower|higher> is better

## Secondary Metrics
- <name>: <command> (<direction>)

## Run Command
<command>

## Scope
<files/dirs>

## Off-Limits
<files/dirs>

## Wall-Clock Budget
<N> minutes

## Termination Condition
<infinite | target: X | count: N>

## Baseline
<!-- Filled after first run -->
PENDING

## Best
<!-- Updated on each keep -->
PENDING
```

### 3.3 Write `.lab/results.tsv`

Header row (tab-separated):
```
experiment	branch	parent	commit	metric	secondary_metrics	status	duration_s	description
```

### 3.4 Create remaining lab files

```bash
touch .lab/log.md .lab/parking-lot.md .lab/branches.md
```

`.lab/branches.md` header:
```markdown
# Branch Registry
| Branch | Forked From | Status | Experiments | Best Metric | Notes |
|--------|-------------|--------|-------------|-------------|-------|
```

### 3.5 Load AMP context into working memory

**MCP mode:**
```
amp_research_context(campaign_id: "<campaign-id>")
```
This returns your full research context: semantic principles, recent keeps, dead ends, contradictions. Internalize all of it.

**Filesystem mode:**
Read and internalize: `.amp/identity.md`, all `.amp/semantic/*.md`, `.amp/episodic/log.jsonl` (last 20 entries), `.amp/procedural/experiment-protocol.md`.

This is your starting intelligence. You are not starting from zero.

### 3.6 Create research branch and run baseline

```bash
git checkout -b research/<campaign-slug>
```

Run baseline experiment (no changes). Record as experiment #0. Update:
- `.lab/config.md` baseline field
- `.lab/results.tsv`

**MCP mode:**
```
amp_research_log(
  campaign_id: "<id>",
  session_id: "<session>",
  experiment_number: 0,
  branch: "research/<slug>",
  parent_id: null,
  commit: "<hash>",
  metric_value: <baseline>,
  status: "keep",
  duration_s: <seconds>,
  hypothesis: "Establish baseline with no changes",
  description: "Baseline run — unmodified codebase",
  insight: "Baseline metric established"
)
```

**Filesystem mode:**
Append to `.amp/episodic/log.jsonl`.

Begin autonomous work immediately.

---

## Phase 4 — Autonomous Research Loop

### Loop: THINK → TEST → REFLECT → [CONSOLIDATE?] → repeat

---

### THINK

**MCP mode — load full context:**
```
amp_research_context(campaign_id: "<campaign-id>", max_tokens: 4000)
```
This gives you: campaign state, semantic principles, recent wins, dead ends, contradictions, stats. Also optionally:
```
amp_research_tree(campaign_id: "<campaign-id>")
amp_research_contradictions(campaign_id: "<campaign-id>", include_uncertain: true)
```

**Always also read:**
1. `.lab/results.tsv` — full experiment history this session
2. `.lab/log.md` (last 5 entries if 20+ exist)
3. `.lab/parking-lot.md` — deferred ideas
4. `.lab/branches.md` — branch status
5. In-scope source files — re-read when forming new hypotheses

**Filesystem mode — additionally read:**
6. All `.amp/semantic/*.md`

Analyze:
- What patterns are emerging across experiments?
- Which semantic principles from AMP apply here?
- Which parking lot items are now unblocked?
- Check convergence signals (see below)
- Do any experiments so far **update your confidence in existing semantic principles**?

Form a specific, falsifiable hypothesis. Write it down before proceeding to TEST.

---

### TEST

**For every real experiment:**

1. `git commit -m "experiment: <short description>"` — BEFORE running. This is your safety net.
2. Execute the run command: `<run_command> > run.log 2>&1`
3. If wall-clock budget exceeded: `kill` the process, treat as TIMEOUT crash
4. Execute ALL measure commands. Record raw values.
5. Decide outcome:

| Outcome | Condition | Action |
|---------|-----------|--------|
| **KEEP** | Metric improved > 0.1% noise threshold, or equal + simpler code | Stay on branch |
| **KEEP*** | Primary improved, secondary significantly regressed | Stay, log trade-off |
| **DISCARD** | Equal or worse | `git reset --hard HEAD~1` |
| **INTERESTING** | No improvement, but reveals something | Keep or revert — your call |
| **CRASH** | Script error / OOM / timeout | `git reset --hard HEAD~1`, read last 50 lines of run.log |
| **TIMEOUT** | Exceeded wall-clock budget | Kill, log as crash, revert |

**Crash rules:**
- Trivial (typo, missing import): fix and re-run ONCE
- Fundamental (OOM, missing dep): log, revert, move on
- 3+ crashes in a row: rethink approach entirely

**For every thought experiment:**
- Log with status `thought` — no commit, no run required

---

### REFLECT

After every experiment (real or thought):

**Write to `.lab/log.md`:**

```markdown
## Experiment N — <title>

- **Branch:** research/<slug>
- **Type:** real | thought
- **Parent:** #M
- **Hypothesis:** <what you predicted>
- **Changes:** <what you actually changed>
- **Result:** <metric value> (was <previous best>)
- **Duration:** <seconds>s
- **Status:** keep | discard | crash | thought | keep* | interesting
- **Insight:** <what this confirms, denies, or opens up>
- **AMP Update:** <any semantic principle updated or created? yes/no>
```

**Write to `.lab/results.tsv`** (one tab-separated row):
```
N	research/<slug>	#M	<commit>	<metric>	<secondary>	<status>	<duration>	<description>
```

**MCP mode — log to the graph:**
```
amp_research_log(
  campaign_id: "<id>",
  session_id: "<session>",
  experiment_number: N,
  branch: "research/<slug>",
  parent_id: "<parent-experiment-id>",
  commit: "<hash>",
  metric_value: <value>,
  secondary_metrics: { "mem_mb": 220, "latency_ms": 45 },
  status: "<status>",
  duration_s: <seconds>,
  hypothesis: "<what you predicted>",
  description: "<what was changed>",
  insight: "<what was learned>",
  components_touched: ["src/model.py", "src/optimizer.py"],
  component_domain: "architecture"
)
```

The response tells you:
- `experiment_id` — use as `parent_id` for the next experiment derived from this one
- `should_consolidate` — if true, run consolidation before next THINK

**Filesystem mode — write AMP episodic entry to `.amp/episodic/log.jsonl`:**

```json
{"id":"exp-N","campaign":"<id>","timestamp":"<ISO>","branch":"research/<slug>","parent":"exp-M","commit":"<hash>","metric":<float>,"status":"<status>","description":"<text>","hypothesis":"<text>","insight":"<text>","components_touched":["<file1>"],"semantic_updated":false}
```

**Update `.amp/manifest.json`** (both modes):
- Increment `total_experiments`
- Increment `total_keeps` or `total_discards`
- Update `best_metric` and `best_commit` if new best

---

### CONSOLIDATE (every 10 real experiments, or when `should_consolidate` is true)

**MCP mode:**
```
amp_research_consolidate(campaign_id: "<campaign-id>")
```

The tool automatically:
- Scans all experiments for patterns (component leverage, exhausted directions, crash patterns, combo synergies)
- Creates new semantic nodes for newly detected patterns
- Updates confidence on existing semantic nodes (reinforcement or contradiction)
- Returns a summary of what changed

**Filesystem mode** — do this manually:

1. Read all episodic entries from this campaign
2. Look for patterns:

   **Pattern types to detect:**
   - Same component touched in 3+ experiments → extract domain principle
   - 2+ keeps in the same code area → "this area has leverage"
   - 2+ discards with same approach → "this direction is exhausted"
   - Experiment confirmed an existing semantic principle → raise its confidence
   - Experiment contradicted an existing semantic principle → lower confidence, add counter-evidence
   - Crash pattern on specific file/area → add gotcha to procedural memory

3. For each pattern detected, update or create a semantic file in `.amp/semantic/`:
   - New principle: write new `<slug>.md` with confidence 0.5
   - Confirmed principle: raise confidence by +0.1 (max 0.95)
   - Contradicted principle: lower confidence by -0.15, add counter-evidence
   - Invalidated principle (2+ contradictions): mark confidence < 0.2, add note

4. Update `.amp/procedural/experiment-protocol.md` if new gotchas discovered

5. Update `.amp/manifest.json`: increment `consolidation_count`, set `last_consolidation_at`, update `semantic_count`

**Both modes** — write a consolidation entry to `.lab/log.md`:

```markdown
## Consolidation — after experiment N

- Patterns detected: <N>
- Semantic principles updated: <list>
- New principles created: <list>
- Confidence changes: <list>
- Procedural updates: <list>
```

---

### BRANCHING

Fork branches to explore divergent approaches.

**When to fork:**
- Fundamentally different approach from an earlier state
- Current branch stagnating (5+ discards with no new direction)
- Combining insights from two separate keep branches
- Promising but risky idea — protect current best

**How to fork:**
1. Pick a parent `keep` experiment from any branch
2. `git checkout <commit>` → `git checkout -b research/<new-slug>`
3. Register in `.lab/branches.md`
4. Next experiment's parent = forked-from experiment number

Mark exhausted branches as `closed` in `.lab/branches.md`.

**Always consider ALL branches when thinking.** The best idea might be combining keeps from two closed branches.

**MCP mode advantage:** Use `amp_research_tree` to visualize the full hypothesis tree across all branches. This shows you lineage, metric progression, and which branches are alive vs exhausted — far richer than reading `.lab/branches.md` alone.

### RE-VALIDATION

Every 10 real experiments: re-run current HEAD against baseline. If regressed >2%, log drift and fork from the best experiment commit.

---

### CONVERGENCE SIGNALS

Read these as system state, not commands. You decide what to do.

| Signal | Meaning |
|--------|---------|
| 5+ discards in a row | Current approach exhausted — fork or pivot |
| Thought experiments repeating | You've modeled this enough — go empirical |
| Results consistently confirm theory | Go deeper in that direction |
| Results contradict theory | Your model is wrong — re-read the code |
| Metric plateau < 0.5% over 5 keeps | Try something radically different |
| Same file modified 3+ times | Explore elsewhere |
| Alternating keep/discard on similar changes | Isolate the variable |
| 2+ timeouts in a row | Approach is too expensive |
| AMP semantic confidence all < 0.4 | Your priors are wrong — run more ablations |
| AMP semantic confidence > 0.8 on a principle | Exploit it — dig deeper there |
| `amp_research_contradictions` returns results | Resolve contradictions with targeted experiments |

---

### AUTONOMY

**Default: complete autonomy.** Do not pause for updates. Do not ask if you should continue. Work, log, compound.

**Only consult the user when:**
1. The only viable path requires files outside agreed scope
2. You have exhausted all strategies, branches, parking lot ideas, and semantic principles

When the user intervenes: accept the direction, log the intervention as a `thought` experiment, continue.

**NEVER STOP unless:**
- Termination condition explicitly set AND met
- User manually interrupts
- You have truly exhausted all approaches (ask in this case)

If you run out of ideas: re-read the codebase. Re-read the semantic memory. Call `amp_research_context` for a fresh perspective. Call `amp_research_contradictions` with `include_uncertain: true` to find principles worth testing. Combine near-misses from different branches. Try something order-of-magnitude different.

---

## Phase 5 — Wrap-Up

When termination is met or user interrupts:

### 5.1 Final re-validation
Re-run from global best commit. Confirm final metric.

### 5.2 Write session summary

**MCP mode:**
```
amp_store(
  session_id: "<session>",
  task: "[campaign:<id>] Session wrap-up summary",
  content: "<full session summary as prose — see template below>",
  outcome: "approved"
)
```

Also run final consolidation:
```
amp_research_consolidate(campaign_id: "<campaign-id>")
```

**Both modes** — write `.amp/episodic/sessions/<campaign-id>.md`:

```markdown
# Session Summary — <campaign-id>

## Objective
<objective>

## Results
- Baseline: <metric>
- Final best: <metric>
- Improvement: <delta> (<percentage>%)
- Total experiments: <N>
- Keeps: <N> | Discards: <N> | Crashes: <N>

## Branch History
<branch name, experiments, outcome>

## Top 3 Impactful Changes
1. Experiment #N — <description> → <metric delta>
2. Experiment #N — <description> → <metric delta>
3. Experiment #N — <description> → <metric delta>

## Key Insights (Semantic Principles Created/Updated This Session)
<list with confidence scores>

## Dead Ends (Do Not Revisit)
<list of approaches with why they failed>

## Parking Lot (Unfinished Ideas for Next Session)
<paste .lab/parking-lot.md content>

## Final Commit
<hash> on <branch>
```

### 5.3 Checkout best branch

```bash
git checkout <best-branch>
```

### 5.4 Report to user

Present concisely:
- Baseline → best metric delta
- Top 3 changes
- Key semantic principles now in AMP memory
- What the next session should start with (top semantic priors)
- Parking lot items for next time

---

## Qualitative Rubric

When primary metric is qualitative, define in `.lab/config.md` and `.amp/identity.md`:

1. List 3–5 criteria with clear definitions
2. Assign weights (sum to 1.0)
3. Use consistent scale (1–10)
4. Composite = `sum(criterion × weight)` → this is your quantitative proxy

Log per-criterion scores in log.md entries.

---

## Hypothesis Strategies

These are tools, not a menu. Use freely. Invent your own.

| Strategy | When it helps |
|----------|--------------|
| **Ablation** | Remove something — unsure what's actually helping |
| **Amplification** | Push what works further — after a keep |
| **Combination** | Merge wins from separate branches |
| **Inversion** | Try the opposite — after a string of discards |
| **Isolation** | Change one variable — unclear what helped |
| **Analogy** | Borrow from adjacent domain — truly stuck |
| **Simplification** | Remove complexity, preserve metric |
| **Scaling** | Change by order of magnitude — small tweaks plateaued |
| **Decomposition** | Split big change into atomic parts |
| **Sweep** | Test parameter across a range |
| **AMP-directed** | A semantic principle with confidence > 0.7 is suggesting something — follow it |
| **AMP-contradiction** | A semantic principle with low confidence — run an experiment to resolve it |
| **AMP-synergy** | Consolidation detected a combo that works — try combining those components again |

---

## AMP File Reference

Quick reference for all files this skill reads and writes:

```
.amp/
├── identity.md               ← repo identity, objective, constraints (read every session)
├── manifest.json             ← experiment counters, campaign state (read+write every run)
├── semantic/
│   ├── <slug>.md             ← distilled principles (read before every THINK, write on consolidation)
│   └── ...
├── episodic/
│   ├── log.jsonl             ← one JSON line per experiment (append after every TEST)
│   └── sessions/
│       └── <campaign>.md     ← session summaries (write on wrap-up)
├── procedural/
│   └── experiment-protocol.md  ← run/measure commands, gotchas (read on load, update on discovery)
└── working/
    └── <scratch>.md          ← temporary working notes (discard freely)

.lab/
├── config.md                 ← session config (write Phase 3, read Phase 4)
├── results.tsv               ← tab-separated experiment log (append every experiment)
├── log.md                    ← narrative experiment log (append every experiment)
├── branches.md               ← branch registry (update on fork/close)
└── parking-lot.md            ← deferred ideas (update during REFLECT)
```

---

## AMP MCP Tool Reference

When in MCP mode, these tools are available. Use them at the indicated points in the loop.

| Tool | When to call | What it does |
|------|-------------|--------------|
| `amp_research_init` | Phase 2 (once per campaign) | Creates campaign in the graph. Returns `campaign_id`. |
| `amp_research_log` | Phase 4 REFLECT (every experiment) | Logs experiment with full provenance: parent link, component edges, campaign membership. Returns `experiment_id` and `should_consolidate`. |
| `amp_research_context` | Phase 4 THINK (every cycle) | Builds dynamic context: semantic principles, recent wins, dead ends, contradictions, stats. |
| `amp_research_tree` | Phase 4 THINK (when analyzing lineage) | Renders hypothesis tree across all branches. |
| `amp_research_contradictions` | Phase 4 THINK (periodically) | Finds conflicting semantic claims + uncertain principles worth testing. |
| `amp_research_consolidate` | Phase 4 CONSOLIDATE (every 10 experiments) | Detects patterns, creates/updates semantic nodes, returns summary. |
| `amp_load` | Phase 0 (session boot) | Load general AMP context for this repo. |
| `amp_store` | Phase 5 (wrap-up) | Store session summary as episodic entry. |
| `amp_query` | Ad-hoc analysis | Run raw Cypher for custom queries. |

---

## Invocation Examples

**Starting fresh on a new repo:**
```
Read amp-researcher.md and let's kick off a new research session on this codebase.
```

**Resuming across sessions:**
```
Read amp-researcher.md — load the AMP memory and resume our research campaign.
```

**Targeting a specific objective:**
```
Read amp-researcher.md — we want to reduce p99 API latency below 100ms.
```

**Running overnight:**
```
Read amp-researcher.md, load AMP, and run the experiment loop indefinitely. I'll check in the morning.
```

---

*The model is commodity. The harness is moat. The memory is infrastructure.*
*— AP3X-Dev*
