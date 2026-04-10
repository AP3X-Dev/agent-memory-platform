---
name: amp-setup
description: "Bootstrap AMP persistent memory for the current project. Analyzes the repo, discovers entities and domain tags, writes AMP Memory config to CLAUDE.md, and calls amp_bootstrap to scaffold the knowledge graph. Run once per project. Trigger: user says 'set up amp', 'bootstrap amp', 'init amp', 'configure amp memory'."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, mcp__amp__amp_load, mcp__amp__amp_store, mcp__amp__amp_query, mcp__amp__amp_bootstrap
argument-hint: "[project name] or auto"
---

# AMP Setup

Bootstrap AMP persistent memory for the current project.

## What This Does

1. Analyzes the repo to identify: project name, description, language, framework, domain
2. Discovers entities (modules, services, components, external systems)
3. Generates domain tags
4. Forms seed priors from code/architecture observations
5. Presents findings to the user for confirmation
6. Writes `## AMP Memory` config section to the project's CLAUDE.md
7. Calls `amp_bootstrap` to scaffold the knowledge graph

## Execution Flow

### Step 1 — Check for Existing Config

Read the project's CLAUDE.md (or AGENTS.md, GEMINI.md). Look for `## AMP Memory` section.

- **If found:** Tell the user AMP is already configured. Offer to update entities/tags or re-bootstrap.
- **If not found:** Proceed to Step 2.

### Step 2 — Detect Mode

- **User-directed** (gave name/description): Accept it. Fill gaps by scanning.
- **Agent-discovered** (no argument or "auto"): Scan autonomously.

### Step 3 — Analyze the Repo

1. Read project config files: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `README.md`
2. Map the source tree — identify major directories, modules
3. Read recent git history — `git log --oneline -20`
4. Identify language, framework, domain

### Step 4 — Discover Entities

Scan for: modules, services, key components, external systems, teams

### Step 5 — Generate Tags

Pick from: `api-design`, `auth`, `deployment`, `testing`, `performance`, `infrastructure`, `frontend`, `backend`, `database`, `devops`, `ml`, `documentation`, `security`, `observability`, `ci-cd`, or create project-specific ones.

### Step 6 — Form Seed Priors

Create 3-5 low-confidence (0.3) observations from the code/architecture.

### Step 7 — Present to User

Show everything discovered. Let the user correct, add, or remove.

### Step 8 — Write Config

Write `## AMP Memory` section to the project's CLAUDE.md:

```markdown
## AMP Memory

Project: <name>
Description: <one-line description>
Domain: <domain>
Project Tag: project:<kebab-case-name>

Entities:
- <entity-1>
- <entity-2>

Tags:
- <tag-1>
- <tag-2>

Store Policy:
- default

Priors:
- <prior-1>
- <prior-2>
```

### Step 9 — Bootstrap Graph

```
amp_bootstrap(
  project_name: "<name>",
  project_tag: "project:<kebab-case-name>",
  description: "<description>",
  domain: "<domain>",
  entities: [...],
  semantic_seeds: [...],
  agents: [{ id: "mcp", name: "Claude Code", type: "assistant" }]
)
```

### Step 10 — Initialize Default Memory Blocks

After bootstrap, seed the core memory tier with initial blocks:

```
amp_memory_insert(block: "persona", scope: "project:<tag>",
  text: "Agent working on <name>. Key conventions: <from analysis>.")

amp_memory_insert(block: "project_state", scope: "project:<tag>",
  text: "Current state: newly bootstrapped. Key entities: <list>. Domain: <domain>.")

amp_memory_insert(block: "user", scope: "project:<tag>",
  text: "")
```

This seeds always-visible core memory blocks that will be included in every `amp_load` response.

## Important

- Runs **once per project**. `amp_bootstrap` is idempotent.
- Project tag format: `project:<kebab-case-name>`.
- Every future `amp_load`/`amp_store` must include the project tag.
- Default memory blocks (persona, user, current_objective, working_state, project_state, open_questions) are created automatically when first written to.
