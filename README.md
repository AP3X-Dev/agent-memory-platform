# AMP — Agent Memory Protocol

A persistent memory system for AI agents. Stores knowledge across sessions, agents, and models using a Neo4j knowledge graph with Redis caching, exposed via MCP (Model Context Protocol).

Unlike RAG systems that retrieve and forget, AMP **learns** — episodic memories get consolidated into semantic principles through signal-driven evolution. The agent on day 10 starts with everything it learned on days 1–9.

## What It Does

- **Persistent memory** — Episodic (what happened) → Semantic (what we know) promotion via consolidation
- **Architectural understanding** — Hierarchical entity graph with typed relations, aspects, drift detection, impact analysis
- **Code intelligence** — AST-based symbol indexing with multi-vector search (dense + lexical + mini projection)
- **Unified retrieval** — Blends architecture + code + memory via RRF fusion with intent classification
- **Research experiment tracking** — Hypothesis trees, campaign management, automated pattern consolidation

## Architecture

```
┌─────────────────────────────────────────────┐
│                 MCP Server                   │
│          25 tools across 5 domains           │
├──────────┬──────────┬──────────┬────────────┤
│  Core    │ Research │   Arch   │    Code    │ Retrieval
│  Memory  │ Experiments│ Structure│ Symbols  │ Fusion
├──────────┴──────────┴──────────┴────────────┤
│              Neo4j Knowledge Graph           │
│         Redis Cache + Signal Streams         │
└─────────────────────────────────────────────┘
```

## Packages

| Package | Tools | Purpose |
|---------|-------|---------|
| `@amp/core` | 6 | Memory load/store, consolidation, graph bootstrap |
| `@amp/research` | 6 | Experiment tracking, hypothesis trees, pattern consolidation |
| `@amp/arch` | 6 | Architectural graph, typed relations, aspects, impact analysis, drift detection |
| `@amp/code` | 5 | AST parsing, symbol graph, multi-vector hybrid search |
| `@amp/retrieval` | 2 | Unified context assembly, intent classification, query expansion |
| `@amp/neo4j` | — | Graph stores, queries, GDS algorithms |
| `@amp/redis` | — | Caching, streams, locks, coordination |
| `@amp/mcp` | — | MCP server, bootstrap wiring |

## MCP Tools

### Core Memory
| Tool | Description |
|------|-------------|
| `amp_load` | Load assembled memory context for a task |
| `amp_store` | Store episodic memory with optional signals |
| `amp_query` | Run read-only Cypher against the knowledge graph |
| `amp_consolidate` | Run/review memory consolidation |
| `amp_resolve` | Resolve `amp://` URIs to rendered context |
| `amp_bootstrap` | Seed the graph with project entities, agents, and semantic priors |

### Research
| Tool | Description |
|------|-------------|
| `amp_research_init` | Initialize a research campaign |
| `amp_research_log` | Log an experiment result with full provenance |
| `amp_research_context` | Build dynamic research context (principles, wins, dead ends) |
| `amp_research_tree` | Visualize the hypothesis tree |
| `amp_research_contradictions` | Find conflicting semantic claims |
| `amp_research_consolidate` | Detect patterns and promote to semantic knowledge |

### Architecture
| Tool | Description |
|------|-------------|
| `amp_arch_register` | Enrich entities with responsibility, interface, internals descriptions |
| `amp_arch_relate` | Create typed relations (USES, CALLS, EXTENDS, IMPLEMENTS, EMITS, LISTENS) |
| `amp_arch_aspect` | Manage cross-cutting concerns with stability tiers |
| `amp_impact` | Blast radius analysis — what breaks if this changes |
| `amp_arch_drift` | SHA-256 drift detection — has the code changed since last indexing |
| `amp_arch_context` | Deterministic architectural context assembly |

### Code Intelligence
| Tool | Description |
|------|-------------|
| `amp_code_index` | AST-based indexing (TypeScript, JavaScript, Python, Go, Rust) |
| `amp_code_search` | Hybrid search: fulltext + dense vector + lexical vector + semantic |
| `amp_code_symbols` | Query symbols by file, name, or kind |
| `amp_code_deps` | Symbol-level dependencies: callers, callees, importers, inheritance |
| `amp_code_context` | Code-aware context assembly for a task |

### Unified Retrieval
| Tool | Description |
|------|-------------|
| `amp_context` | The "super-load" — blends architecture + code + memory with intent-classified routing |
| `amp_feedback` | Record result usefulness to improve future rankings |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Redis + Neo4j)

### Setup

```bash
git clone https://github.com/AP3X-Dev/agent-memory-protocol.git
cd agent-memory-protocol

# Start Redis + Neo4j
docker compose up -d

# Configure
cp .env.example .env
# Edit .env with your Neo4j password

# Install and build
npm install
npm run build

# Run MCP server
npm run dev
```

### Connect to Claude Code

Add to your Claude Code MCP settings:

**SSE (default):**
```json
{
  "mcpServers": {
    "amp": {
      "type": "sse",
      "url": "http://localhost:3101/sse"
    }
  }
}
```

**Stdio:**
```json
{
  "mcpServers": {
    "amp": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "packages/mcp/src/server.ts", "--stdio"],
      "cwd": "/path/to/agent-memory-protocol",
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password",
        "REDIS_URL": "redis://:your-password@localhost:6379"
      }
    }
  }
}
```

## How It Works

### Memory Lifecycle

```
Agent works → stores episodic memory (amp_store)
                    ↓
           Signals: reinforcement / correction / contradiction
                    ↓
           Consolidation clusters signals by target
                    ↓
           Patterns promoted to semantic knowledge (confidence-scored)
                    ↓
           Next session loads evolved knowledge (amp_load / amp_context)
```

### Knowledge Graph

```
(:Entity:Project) -[:CONTAINS]-> (:Entity:Module) -[:CONTAINS]-> (:Entity:Component)
       ↑                              ↑                               ↑
  [:ABOUT]                        [:USES]                        [:MODIFIED]
       ↑                              ↑                               ↑
(:Semantic)                    (:Entity:Service)              (:Experiment)
  confidence: 0.82              -[:CALLS]->                   -[:DERIVED_FROM]->
                                -[:EXTENDS]->                 (:Experiment)
(:Aspect) -[:APPLIES_TO]-> (:Entity)
  stability_tier: "protocol"

(:Symbol) -[:SYMBOL_CALLS]-> (:Symbol)
  kind: "function"            -[:DEFINED_IN]-> (:Entity:Component)
```

### Retrieval Pipeline

```
Query → Intent Classification (GRAPH / SEMANTIC / IDENTIFIER / HYBRID)
  ↓
Query Expansion (100+ code synonyms, phrase synonyms)
  ↓
Parallel Search: fulltext + dense vector + lexical vector + semantic memory
  ↓
RRF Fusion (dynamic k scaling for large collections)
  ↓
Lexical Text Boost (symbol/path/filename matching)
  ↓
MMR Diversification (bounded to 200 candidates)
  ↓
Token-budgeted context assembly
```

## Development

```bash
# Build all packages
npm run build

# Run tests (384 tests)
npm test

# Run retrieval benchmark
npm run bench -w packages/retrieval

# Start MCP server (dev mode with hot reload)
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | — | Neo4j password |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection (with auth: `redis://:password@host:port`) |
| `OPENAI_API_KEY` | — | For embedding-based semantic search (optional — works without) |
| `MCP_PORT` | `3101` | MCP server port |
| `AMP_API_TOKEN` | — | Optional Bearer token for SSE endpoint auth |

## Agent Agnostic

AMP works with any MCP-compatible agent: Claude Code, Cursor, Windsurf, Cline, Codex, or custom agents. The protocol defines the tool contracts — the agent just calls them.

## License

BUSL-1.1
