---
name: memberry-wiki
description: "Wiki operations for MemBerry knowledge bases. Compile the graph into a browsable interlinked wiki, ingest source documents, run health checks. Use when the user wants to: build/update the wiki, ingest research material, check knowledge quality, browse the knowledge base."
allowed-tools: Bash, Read, Write, Glob, Grep, mcp__memberry__berry_compile, mcp__memberry__berry_ingest, mcp__memberry__berry_lint, mcp__memberry__berry_query, mcp__memberry__berry_provenance, mcp__memberry__berry_load
argument-hint: "compile [dir] | ingest <path> [type] | lint [checks] | serve [port]"
---

# MemBerry Wiki

Build and maintain a knowledge wiki from the MemBerry graph.

## Subcommands

### compile [output_dir]

Compile the knowledge graph into interlinked markdown wiki pages.

1. Determine project tag from MemBerry Memory config.
2. Default output dir: `./wiki/`
3. Call:
   ```
   berry_compile(
     project_tag: "project:<tag>",
     output_dir: "<dir>",
     format: "obsidian",
     emit_graph: true
   )
   ```
4. Report: articles compiled, links resolved, index files generated.

**Output structure:**
```
wiki/
  _index.md            # Entity index grouped by type
  _decisions.md        # All claims sorted by confidence
  _graph/
    graph.md           # Mermaid diagram of entity relationships
    entities.json      # Entity metadata for visualization
    edges.json         # All relationships
  <entity-slug>.md     # One article per entity with [[wikilinks]]
```

### ingest <path> [type]

Ingest a source document. Auto-extracts entities and claims.

1. Determine source type: article, paper, repo, dataset, note, reference. Infer from extension or ask.
2. Call:
   ```
   berry_ingest(
     source_path: "<path>",
     source_type: "<type>",
     project_tag: "project:<tag>"
   )
   ```
3. Report: source ID, entities found, claims extracted, citations created.

**Batch ingestion:** For multiple files, loop over them:
```
for each file in <directory>:
  berry_ingest(source_path: file, source_type: "article", project_tag: "project:<tag>")
```

### lint [checks]

Run health checks.

1. Default: run all 10 checks.
2. Specific checks: `lint orphan_pages contradictions`
3. Call:
   ```
   berry_lint(project_tag: "project:<tag>", checks: ["<check1>", "<check2>"])
   ```
4. Present results by severity (ERROR > WARNING > INFO).

### serve [port]

Start the wiki viewer. Default port: 3200.

The viewer is a self-hosted web app that renders the compiled wiki as navigable HTML:
- Clickable `[[wikilinks]]` between articles
- Sidebar with metadata and TOC
- Full-text search
- Dark theme

## Typical Workflow

```
1. Ingest sources      → berry_ingest (raw/ directory)
2. Store agent work    → berry_store (automatic via CLAUDE.md)
3. Compile wiki        → berry_compile (generates wiki/)
4. Lint for quality    → berry_lint (find issues)
5. Fix issues          → berry_store, berry_arch_relate, berry_ingest
6. Recompile           → berry_compile (updated wiki/)
7. Browse              → read markdown or start viewer
```

Each cycle enriches the knowledge base. Queries and explorations compound.
