# Memory Operations — recall, remember, query

---

## recall [topic]

Load AMP memory relevant to the current context.

### Flow

1. **Find AMP config** — extract project tag, entities, tags from project CLAUDE.md
2. **Build amp_load call:**
   - User gave a topic -> use as task, match entities from config
   - No topic -> infer from conversation context
3. **Call amp_load:**
   ```
   amp_load(task: "<topic>", entities: [<matching>], tags: ["project:<tag>"], max_tokens: 4000)
   ```
4. **Present results:**
   - Semantic knowledge with confidence scores (0.8+ = established, 0.3 = seed)
   - Episodic records with decisions and outcomes
   - No results? Suggest storing via `/amp remember`

---

## remember <what>

Store knowledge to AMP.

### Flow

1. **Parse what to remember.** Categorize: decision, preference, learning, architecture, bug/root cause, convention.

2. **Generate session_id** — `session-{YYYYMMDD}-{HHMMSS}`. Reuse if already set.

3. **Identify entities** — match against known entities from AMP config. Or omit and let auto-extraction handle it.

4. **Check for signals** (optional):
   - Load existing knowledge: `amp_load(task: "<topic>", tags: ["project:<tag>"])`
   - If a semantic entry matches -> generate reinforcement, correction, or contradiction signal

5. **Store:**
   ```
   amp_store(
     session_id: "<id>",
     task: "[project:<tag>] <category>: <brief>",
     content: "[project:<tag>] <detailed prose>",
     outcome: "approved",
     entities: ["<project>", "<relevant>"],   // optional — auto-extracted if omitted
     signals: [<if applicable>]
   )
   ```

6. **Confirm** — tell user what was stored and which entities it linked to.

### Auto-extraction note

If you omit `entities`, the system uses GPT-4o-mini to extract entity names from the content and link them automatically. This is a safety net — explicit entities are always preferred.

---

## query <q>

Run a query against the AMP knowledge graph.

### Flow

1. **Detect query type:**
   - Starts with `MATCH`, `RETURN`, `CALL` -> raw Cypher
   - Natural language -> translate to Cypher

2. **Common translations:**

   | Natural language | Cypher |
   |-----------------|--------|
   | "What do we know about X?" | `MATCH (s:Semantic)-[:ABOUT]->(e:Entity {name: 'X'}) RETURN s.content, s.confidence ORDER BY s.confidence DESC` |
   | "Show all entities" | `MATCH (e:Entity) RETURN e.name, e.type ORDER BY e.type, e.name` |
   | "High-confidence knowledge" | `MATCH (s:Semantic) WHERE s.confidence >= 0.7 RETURN s.content, s.confidence ORDER BY s.confidence DESC` |
   | "Recent activity" | `MATCH (ep:Episodic) RETURN ep.task, ep.created_at ORDER BY ep.created_at DESC LIMIT 10` |
   | "Project structure" | `MATCH (p:Entity {type: 'project'})-[:CONTAINS]->(child) RETURN p.name, child.name, child.type` |
   | "Find contradictions" | `MATCH (ep:Episodic)-[:CONTRADICTS]->(s:Semantic) RETURN s.content, s.confidence, count(ep) AS contradictions` |
   | "Ingested sources" | `MATCH (src:Source) RETURN src.title, src.source_type, src.created_at ORDER BY src.created_at DESC` |
   | "Symbol count by language" | `MATCH (sym:Symbol) RETURN sym.language, count(sym) AS count ORDER BY count DESC` |

3. **Execute:** `amp_query(query: "<cypher>", limit: 10)`

4. **Format results** — tables for structured data, bullets for knowledge.

### Graph schema reference
- **Node types:** Entity, Semantic, Episodic, Fact, MemoryBlock, Agent, Model, Aspect, Symbol, Component, Campaign, Experiment, Source, Procedural
- **Key relationships:** ABOUT, CONTAINS, REINFORCES, CORRECTS, CONTRADICTS, PROMOTED_FROM, SUPERSEDES, CITES, FACT_ABOUT, SOURCED_FROM, SUPERSEDES_FACT, USES, CALLS, EXTENDS, IMPLEMENTS, EMITS, LISTENS, APPLIES_TO, SYMBOL_CALLS, SYMBOL_IMPORTS, DEFINED_IN

---

## Memory Tier Operations

Memory blocks are organized into three tiers: **core** (always visible), **working** (session-scoped), **archive** (graph-backed). These tools give agents explicit control over structured memory.

### Read a block

```
amp_memory_read(block: "user", scope: "project:my-project")
```

### Write to a block

```
// Append text
amp_memory_insert(block: "working_state", scope: "project:my-project",
  session_id: "session-20260409-143000",
  text: "Completed fact store. Moving to timeline queries.")

// Find-and-replace (replaces ALL occurrences)
amp_memory_replace(block: "user", scope: "project:my-project",
  old_text: "Prefers tabs", new_text: "Prefers 2-space indent")

// Overwrite entirely
amp_memory_rewrite(block: "current_objective", scope: "project:my-project",
  content: "Implement canonical entity resolution for temporal facts.")
```

### Promote and archive

```
// Promote working → core (persists to Neo4j, strips session_id)
amp_memory_promote(block: "working_state", from_tier: "working", to_tier: "core",
  scope: "project:my-project", session_id: "session-20260409-143000")

// Archive a block (returns content for episodic storage, deletes the block)
amp_memory_archive(block: "open_questions", scope: "project:my-project",
  session_id: "session-20260409-143000")
```

### Default blocks

| Block | Tier | Purpose |
|-------|------|---------|
| `persona` | core | Agent identity and capabilities |
| `user` | core | User preferences and conventions |
| `current_objective` | core | What the agent is working toward |
| `project_state` | core | High-level project status and decisions |
| `working_state` | working | Session progress and scratch notes |
| `open_questions` | working | Unresolved items to investigate |

### Token budgets

`amp_load` allocates tokens per tier: core ~15%, working ~10%, facts ~15%, archive ~60%. Blocks exceeding their budget are truncated.

---

## Temporal Fact Operations

### timeline <entity>

Show the chronological fact history for an entity.

```
amp_timeline(entity: "auth-module")
amp_timeline(entity: "auth-module", include_episodes: true, limit: 20)
```

Returns all facts about the entity ordered by valid_at, with status transitions (created, invalidated, disputed, superseded).

### fact-diff <entity>

Show what changed about an entity between two timestamps.

```
amp_fact_diff(entity: "auth-module", from: "2026-03-01T00:00:00Z", to: "2026-04-01T00:00:00Z")
```

Returns: added facts, invalidated facts, and changed facts (old → new via supersession).

### Time-aware retrieval

Pass the `temporal` parameter to `amp_load` for time-scoped queries:

```
// Current facts only (default)
amp_load(task: "...", temporal: { time_mode: "current" })

// What was believed at a specific time
amp_load(task: "...", temporal: { time_mode: "historical", as_of: "2026-03-15T00:00:00Z" })

// Facts active during an interval
amp_load(task: "...", temporal: { time_mode: "interval", from: "2026-03-01T00:00:00Z", to: "2026-04-01T00:00:00Z" })

// Full fact evolution including invalidated
amp_load(task: "...", temporal: { time_mode: "evolution", include_invalidated: true })
```

### Entity resolution

Facts use canonical entity resolution. "AMP", "amp", and "Agent Memory Protocol" all resolve to the same entity if aliases exist. The system resolves via: exact name → case-insensitive → alias match. New name variants are automatically added as aliases.
