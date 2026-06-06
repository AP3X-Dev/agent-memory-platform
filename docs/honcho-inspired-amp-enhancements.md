# Honcho-Inspired Enhancements for AMP — Implementation Plan

> **Status:** Proposed / not started.
> **Audience:** An engineer (or agent) implementing this in a *fresh session* with no prior conversation context. This document is self-contained: it explains the source ideas, the current AMP architecture with exact file anchors, and a step-by-step plan for each feature.
> **Repo:** `/home/cerebro/projects/amp` (TypeScript monorepo, npm workspaces).
> **Line numbers** in this doc are *anchors as of writing* and may drift; each is paired with a symbol name and a `grep` hint so you can re-locate it. Always confirm by reading the file before editing.

---

## 0. How to use this document

1. Read §1 (background) and §2 (current architecture primer) once.
2. Implement in the order given in §3 (Sequencing). The features share a prerequisite (a shared LLM client), so build that first.
3. Each feature section (§4–§9) has the same shape: **Goal → Honcho reference → Current AMP state (file anchors) → Design → Exact changes (per file) → Tests → Risks.**
4. Before committing: update the agent-facing docs and the drift-guard test (§10). Per repo convention, **never reference AI/LLM/assistant authorship in commit messages, branch names, or PR text.**

---

## 1. Background

### 1.1 The philosophy difference (why these ideas are worth taking)

**Honcho** (Plastic Labs) is *message-stream-native and person-centric*: it passively ingests raw conversation turns, derives a psychological "Representation" of each peer through background reasoning, and exposes that representation through an **agent you query in natural language** (the Dialectic / Chat endpoint).

**AMP** is *decision-native and graph-centric*: the agent curates what's worth storing (`amp_store`), consolidation clusters episodic→semantic with signals/confidence/temporal-decay, and retrieval *assembles ranked context* (`amp_load` / `amp_context`).

That gap — **synthesis vs. assembly**, **generative background reasoning vs. reactive clustering** — is exactly where Honcho's ideas add value. AMP's graph is arguably richer than Honcho's; what AMP lacks is (a) a reasoning surface on top of the graph, and (b) a background pass that *generates* knowledge rather than only reorganizing what was explicitly stored.

### 1.2 Honcho reference map (sources)

Study these before implementing. They are the authority for the *intent* of each feature.

| Concept | Where to read | What to extract |
|---|---|---|
| Repo root + README | https://github.com/plastic-labs/honcho | Overall "memory for stateful agents" framing; workspace/peer/session/message model |
| Agent guide | https://github.com/plastic-labs/honcho/blob/main/CLAUDE.md | Internal module layout; the deriver, dialectic, dreaming components |
| Architecture | https://honcho.dev/docs/v2/documentation/core-concepts/architecture | Deriver pipeline; global vs local representations; summaries (short every 20 msgs / long every 60, recursive); **serial-per-peer, parallel-across-peers** processing; `get_context` |
| Honcho 3 announcement | https://plasticlabs.ai/blog/posts/Honcho-3 | **Dreaming Agent** (crawls everything known, fills gaps, rearranges for retrieval, forms testable hypotheses, deductive/inductive/abductive); split of cheap explicit *ingestion* from expensive *dreaming*; **reasoning levels** `minimal/low/medium/high/max`; Dialectic Agent replacing static retrieval paths |
| Dialectic API (archived) | https://blog.plasticlabs.ai/archive/ARCHIVED;-Introducing-Honcho's-Dialectic-API | "Query Honcho about a peer"; framing matters ("what is the user's mood" not "what is your mood") |

**Honcho code to study (Python / FastAPI, under `src/`; verify paths against current `main`):**
- `src/deriver/` — the background deriver worker + queue. This is the model for AMP's "dream" pass. Note how it ensures *tasks affecting the same peer are processed serially in message order* while different peers run in parallel.
- The **dialectic / chat endpoint** router (`POST /peers/{peer_id}/chat`) — how a natural-language question is turned into a search-everything-then-synthesize call with a reasoning-level knob. This is the model for AMP's `amp_ask`.
- The representation / conclusions storage (collections keyed by `(observer, observed)` pairs) — relevant to the medium-tier "cards" idea.

> The Honcho repo is Python; AMP is TypeScript. We are porting **ideas and control-flow shapes**, not code. Do not copy code.

### 1.3 Scope of this plan

In priority order (this doc covers all of them):

- **§4 — Dialectic retrieval (`amp_ask`)** — high value. Ask memory a question; get a synthesized, cited answer with tunable reasoning level.
- **§5 — Split write-path + background "Dream" pass** — high value. Cheap explicit capture stays on the write path; expensive gap-filling/hypothesis-forming moves to a scheduled background `DreamEngine`.
- **§6 — `inference_type` on facts + abductive hypotheses** — medium-high value. Tag facts deductive/inductive/abductive; let the dream pass mint low-confidence abductive facts that the existing signal→confidence→invalidation loop confirms or kills.
- **§7 — Auto-derived "cards"** — medium. Auto-refresh a compact `project_card` / `user_card` core block from accumulated episodes + high-confidence facts.
- **§8 — Per-entity serialization** — medium. A per-entity mutex so concurrent dream/consolidation writes to one entity can't race (generalizes the recent Neo4j single-session fix).
- **§9 — Tiered models per task** — medium. Config-driven model selection: cheap extraction model vs. stronger synthesis/dream model.
- **§3.1 — Shared LLM client** — prerequisite cross-cutting change that §4/§5/§7 all depend on.

---

## 2. Current AMP architecture primer (with file anchors)

Monorepo workspaces (`package.json`): `core`, `neo4j`, `redis`, `mcp`, `research`, `arch`, `code`, `retrieval`, `wiki`, `graph`. Build with `npm run build` (tsc project refs). Tests are per-package vitest (`npm run test --workspaces`).

> **Gotcha (from prior sessions):** the canonical build output is `dist/`. Untracked `src/*.js` files can silently shadow `.ts` in vitest — if tests behave oddly, delete stray compiled `.js` under `packages/*/src/`.
> **Gotcha:** Neo4j integers come back as BigInt — coerce with `.toNumber?.()` before arithmetic (see `getCollectionSize()` in `assembler.ts`).

### 2.1 MCP tool registration (`packages/mcp/src/tools.ts`)

- **Service injection:** module-level `let ampService … = null` vars (~L83–90); `setServiceInstances({...})` (~L92–110) is called from bootstrap to inject concrete services. Handlers read these module vars.
- **Handler shape:** `type ToolResult = Promise<{ content: Array<{ type: 'text'; text: string }> }>` (~L345). Helper `textContent(text)` (~L415–417). Handlers are built in `buildToolHandlers()` (~L426).
- **Annotations (critical):** Never pass `{}` as the annotations arg — the SDK overload parser treats empty `{}` as a Zod raw-shape and shifts the handler out of the callback slot ("typedHandler is not a function"). Use the non-empty constants near ~L1105–1114: `ANN_READONLY = { readOnlyHint: true }`, `ANN_READONLY_IDEMPOTENT = { readOnlyHint: true, idempotentHint: true }`, `ANN_WRITE = { readOnlyHint: false }`, etc. Guarded by `packages/mcp/src/__tests__/tool-registration.regression.test.ts`.
- **Tier-1 registration pattern** (always-visible), e.g. `amp_load` (~L1148–1154):
  ```ts
  tier1.push(server.tool('amp_load', '<desc>', AmpLoadSchema, ANN_READONLY_IDEMPOTENT, handlers.amp_load));
  ```
- **Tier-2 (domain-gated):** `addToDomain('memory', server.tool(...))`.
- **Progressive disclosure registry:** `ToolDomain` union + `DOMAIN_DESCRIPTIONS` (~L125–169); `ALWAYS_ON_TOOL_NAMES` (~L1392); `DOMAIN_TOOL_NAMES_MAP` (~L1401). The `amp_tools` gateway (~L1292–1363) flips domains on/off and calls `server.sendToolListChanged()`.
- **`amp_consolidate` handler** ~L781–811; `AmpConsolidateSchema` ~L216–224.

### 2.2 Retrieval package (`packages/retrieval/src/`)

- **`amp_context` tool** lives here, not in `mcp/tools.ts`: `registerRetrievalTools(server)` in `tools.ts` (full file ~135 lines). `amp_context` pushed to `tier1` (~L72–105); `amp_feedback` to `tier2` (~L108–132). `RETRIEVAL_TOOL_NAMES = ['amp_context','amp_feedback']` (~L52). Service injection via `setRetrievalServiceInstances({ assembler, feedbackTracker })` (~L42–48).
- **`UnifiedAssembler`** (`assembler.ts`): constructor `(driver, redis: FeedbackRedisLayer, codeLayer, memoryLayer, embedding: EmbeddingProvider)` (~L46–55). `assemble(task, options)` dispatches auto/ranked/deterministic (~L83–117). `assembleRanked()` (~L158–224) fans out arch + code + memory searches, then RRF-fuses. `renderMarkdown(ctx)` (~L122–154) emits markdown with `<!-- id -->` provenance comments. `groupAndBudget()` (~L419–453) enforces `max_tokens`.
- **Result shape** (`types.ts` ~L8–55): `RetrievalResult { id, source_type, title, content, score, metadata }`; `UnifiedContext { task, strategy, sections, token_count, assembled_at }`; `ContextItem { id, content, score, metadata }`. `SourceType = 'semantic'|'episodic'|'symbol'|'arch_entity'|'aspect'`.
- **No LLM call exists in this package today** — it is embedding + Neo4j + RRF only. The only chat-completion call site in the whole repo is `extractFacts()` (see §2.5).
- **Memory layer** = `ampService` (the `AMPService` from core implements `AssemblerMemoryLayer.load`). **Code layer** = `codeSearchService`.
- **Bootstrap wiring** (`packages/mcp/src/bootstrap.ts` ~L269–280): `new UnifiedAssembler(driver, feedbackRedis, codeSearchService, ampService, embedding)` then `setRetrievalServiceInstances({ assembler, feedbackTracker })`.

### 2.3 Core service (`packages/core/src/service.ts`)

- **`AMPService.load(scope)`** (~L180–349): cache → concurrent fan-out of (core+working blocks) ‖ (semantic byScope + byVector) ‖ (facts per entity) → graph expansion → rank → **per-tier token budget**: `CORE_BUDGET_RATIO=0.15`, `WORKING_BUDGET_RATIO=0.10`, `FACT_BUDGET_RATIO=0.15`, archive gets the remainder (~L194–197, L298–300). Renders blocks markdown (`renderBlocksMarkdown` ~L652) + facts (`renderFactsMarkdown` ~L680) + archive.
- **`AMPService.store(input)`** (~L353–457): dedup → embed → resolve project tag → create Episodic → link agent/entities/model → publish signals + `queue.incrementScore(target,1)` (~L437) → **fire-and-forget** `_extractFactsBackground()` (~L453).
- **`_extractFactsBackground()`** (~L465–581): calls `extractFacts`, normalizes predicates (`normalizePredicate` ~L795), invalidates conflicting facts, creates new `FactNode` (status `'active'`, ~L499–517), links co-extracted facts, applies staleness decay.
- **`BlocksLayer.listBlocks`** is what `load()` uses to pull core/working blocks (~L84–86, L202–210).

### 2.4 Consolidation (`packages/core/src/consolidation.ts`)

- **`ConsolidationEngine`** ctor `(redis: ConsolidationRedisLayer, neo4j: ConsolidationNeo4jLayer, config: AMPConfig)` (~L163–172).
- **Dependency interfaces:** `ConsolidationNeo4jLayer { semantic{getById,updateConfidence,supersede}, fact?: ConsolidationFactLayer }` (~L143–150); `ConsolidationFactLayer { create, findBySubjectPredicate, invalidate, dispute }` (~L136–141).
- **`run(scope)`** (~L176–220): acquire lock → consume ≤100 signals → pop ≤20 queue entries → `_generateProposals` → autoApply or save for review.
- **`_generateProposals`** (~L265–323): cluster signals by `target_id`, weight via `SIGNAL_WEIGHTS {correction:5, contradiction:3, reinforcement:1}`, threshold `config.consolidation.signalThreshold` (default 3) → supersede/reinforce/decay proposals.
- **`_applyProposal`** (~L327–378): supersede creates new `SemanticNode`, then `_extractAndStoreFacts(content, id, affected_ids)` (~L382–462) and `_disputeRelatedFacts()` (~L464–486).
- **Trigger:** manual only — via `amp_consolidate` MCP tool. **No scheduler exists.** Adapter in bootstrap (`consolidationAdapter` ~L131–148).

### 2.5 Facts

- **Type** (`packages/core/src/types.ts` ~L166–184): `FactNode { id, subject, predicate, original_predicate?, object, entity_id, source_episode_ids, valid_at, invalid_at, confidence, status, supersedes_fact_id, scope, embedding?, tags, created_at, updated_at }`. `FactStatus = 'active'|'invalidated'|'disputed'|'tentative'` (~L163). `FactScope = 'user'|'project'|'repo'|'agent'|'session'` (~L164). `FactInput` (~L186–195).
- **Store** (`packages/neo4j/src/fact.ts`): `FactStore.create(fact)` runs a `CREATE (f:Fact {...})` with explicit property list (~L24–59), then `SOURCED_FROM`/`FACT_ABOUT`/`SUPERSEDES_FACT` edges. `mapFactNode(props)` (~L388–408) reads props back with defaults. `invalidate` (~L182), `dispute` (~L204), `getActive` (~L119), `findBySubjectPredicate` (~L316), `updateConfidence` (~L373).
- **Schema** (`packages/neo4j/src/schema.ts`): `fact_id` unique constraint (L13); indexes `fact_status_valid`, `fact_subject`, `fact_scope`, `fact_invalid_at`, `fact_updated_at`, `fact_entity_id` (L21–26); fulltext `fact_content` (L33); vector `fact_embedding` (L39).
- **Ranking/decay** (`packages/core/src/ranking.ts`): `rankFacts(facts)` uses `confidence * recencyScore * FACT_STATUS_MULTIPLIER[status]`; `FACT_STATUS_MULTIPLIER {active:1.0, tentative:0.7, disputed:0.5, invalidated:0.15}`; `RECENCY_DECAY_DAYS=7`, `FACT_DECAY_MULTIPLIER=4`.
- **Extraction** (`packages/core/src/extract.ts`): `extractFacts(content, apiKey)` (~L79–125) → `new OpenAI({apiKey})`, `model: 'gpt-4o-mini'` (L90), JSON mode, `FACT_EXTRACTION_PROMPT` (~L61–71). `isTransientError()` (~L13–25) drives retries. **This is the canonical existing chat-completion call to mirror.**

### 2.6 Memory blocks (`packages/core/src/blocks.ts`)

- `MemoryBlockService` with `read / insert / replace / rewrite / promote / archive / listBlocks / initDefaults`. Storage: core tier → Neo4j `MemoryBlock` nodes; working tier → Redis (24h TTL). Scope = `project:<tag>`.
- `DEFAULT_BLOCKS` (`types.ts` ~L246–253): `persona`, `user`, `current_objective` (core); `working_state`, `open_questions` (working); `project_state` (core).
- Core blocks are auto-loaded by `AMPService.load()` and rendered under `## Core Memory` (`renderBlocksMarkdown`). They share the **15% core token budget**.

### 2.7 Config (`packages/core/src/types.ts` + `services-factory.ts`)

- `AMPConfig` (~L127–134): `{ redis, neo4j, embedding{provider,apiKey}, cache{...TTLs}, consolidation{autoApply,signalThreshold}, exportPath }`. **No model selection field today.**
- `createCoreServices(env)` in `packages/core/src/services-factory.ts`: `resolveEnv()` reads `NEO4J_URI/USER/PASSWORD`, `REDIS_URL`, `OPENAI_API_KEY`, `AMP_EXPORT_PATH`. Builds `config` object (consolidation defaults `{autoApply:false, signalThreshold:3}`). Returns `{ driver, redis, cache, …, ampService, memoryBlocks, close() }`.
- Hook settings (`packages/core/src/config/settings.ts`): `AmpSettings { hooks: { timeoutMs, turnTokens, sessionTimeoutMs } }`, `DEFAULT_SETTINGS`.

### 2.8 CLI (`packages/core/src/cli.ts`)

- `main()` (~L157) parses argv and `switch (command)` (~L167–209) over `export | import | snapshot | hook | context | hooks` (+ special-cased `run` at ~L160). No `dream`/`consolidate` command yet. `createCoreServices()` is the entry to services from the CLI (e.g. `cli/hook.ts`, `cli/context.ts`).

### 2.9 Scheduling / deploy

- `deploy/systemd/` currently holds only `amp-mcp-readyz.conf`. The wiki timer (`amp-wiki-compile.timer`) referenced in CLAUDE.md lives on the host, not in-repo. New timers (for the dream pass) should be added under `deploy/systemd/` and documented.

### 2.10 The recent Neo4j concurrency fix (reference for §8)

Commit `86dace9` "fix(neo4j): don't run concurrent queries on one session". Pattern: **never `Promise.all` two `session.run()` calls on the same session** — each concurrent query needs its own `driver.session()`. Sequential queries may share a session. See `packages/neo4j/src/query.ts` (the per-neighbor expansion uses a second `factSession` ~L395–402) and `schema.ts` (sequential `SHOW CONSTRAINTS` then `SHOW INDEXES`). §8 generalizes the *logical* version of this (serialize writes per entity).

---

## 3. Sequencing & dependencies

```
3.1 Shared LLM client (prerequisite for 4, 5, 7, 9)
        │
        ├──► 9. Tiered models per task (config; small, do alongside 3.1)
        │
        ├──► 4. amp_ask (dialectic retrieval)         [independent of 5/6]
        │
        └──► 6. inference_type on facts (schema + creation sites)
                    │
                    └──► 5. Dream pass (mints abductive facts)
                                │
                                ├──► 7. Auto-derived cards (runs in dream pass)
                                └──► 8. Per-entity serialization (used by dream writes)
```

Recommended build order: **3.1 → 9 → 6 → 4 → 5 → 8 → 7.** §4 (`amp_ask`) can be built immediately after 3.1 if you want the highest-value win first; it does not depend on 5/6.

Each feature is independently shippable behind the shared LLM client. Ship in small PRs.

---

## 3.1 Prerequisite — Shared LLM chat client

**Goal:** One place to make a chat-completion call, with model selectable per task. Today only `extract.ts` calls OpenAI chat, ad hoc. §4/§5/§7 each need an LLM call; do not duplicate the `new OpenAI()` pattern three more times.

**New file:** `packages/core/src/llm.ts`

```ts
// packages/core/src/llm.ts
import OpenAI from 'openai';
import { isTransientError } from './extract.js';

export type LlmTask = 'extraction' | 'synthesis' | 'dream';

export interface ChatOptions {
  model?: string;            // overrides the per-task default
  temperature?: number;      // default 0
  maxTokens?: number;        // default 1024
  jsonMode?: boolean;        // response_format json_object
  signal?: AbortSignal;      // for timeouts
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

/** Default model per task. Overridable via AMPConfig.models (see §9). */
export const DEFAULT_MODELS: Record<LlmTask, string> = {
  extraction: 'gpt-4o-mini',   // keep cheap — explicit capture
  synthesis:  'gpt-4o',        // dialectic answers
  dream:      'gpt-4o',        // background hypothesis forming
};

export interface LlmClient {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}

export class OpenAiLlmClient implements LlmClient {
  private client: OpenAI;
  constructor(private apiKey: string, private models: Record<LlmTask, string> = DEFAULT_MODELS) {
    this.client = new OpenAI({ apiKey });
  }
  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.client.chat.completions.create({
          model: opts.model ?? this.models.synthesis,
          messages,
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 1024,
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }, opts.signal ? { signal: opts.signal } : {});
        return res.choices[0]?.message?.content ?? '';
      } catch (err) {
        if (attempt < MAX_RETRIES && isTransientError(err)) {
          await new Promise(r => setTimeout(r, Math.pow(3, attempt) * 1000));
          continue;
        }
        throw err;
      }
    }
    return '';
  }
}

/** Null client used when no API key is configured — callers must degrade gracefully. */
export class NullLlmClient implements LlmClient {
  async chat(): Promise<string> { return ''; }
}
```

**Wiring:**
- Export from `packages/core/src/index.ts` (add `export * from './llm.js'` or named exports).
- In `services-factory.ts`, construct once: `const llm = openaiKey ? new OpenAiLlmClient(openaiKey, config.models) : new NullLlmClient();` and add `llm` to the returned `CoreServices`.
- Optionally refactor `extract.ts` later to accept an `LlmClient` instead of a raw key. **Do not do this refactor in the same PR** — `extractFacts(content, apiKey)` is called from `service.ts` and `consolidation.ts`; keep it stable. (You may add an overload that accepts `{ model }` for §9 instead.)

**Tests:** `packages/core/src/__tests__/llm.test.ts` — inject a fake `OpenAI` (or test against a stub `LlmClient`) to assert retry-on-transient and model-override behavior. Follow the existing mock style in `extract` tests.

---

## 4. Feature: Dialectic retrieval — `amp_ask`

### 4.1 Goal
Add a tool that takes a natural-language **question** about the memory graph and returns a **synthesized, cited answer** — not a pile of ranked chunks. Reasoning effort is tunable. Example: "Does the user prefer X or Y?" where the answer requires combining three facts → return the inferred conclusion plus the supporting node IDs.

### 4.2 Honcho reference
The Chat / Dialectic endpoint (`POST /peers/{peer_id}/chat`): "the model can search across *everything* Honcho knows about the target to synthesize the best possible answer," stringing facts together with logical inference; **reasoning levels** `minimal/low/medium/high/max` control compute (Honcho 3 blog; Dialectic API blog). Study the dialectic router in `src/` and how the reasoning level maps to model/effort.

### 4.3 Current AMP state
- `amp_context` (`retrieval/tools.ts` ~L72–105) returns assembled markdown via `assembler.renderMarkdown()`. No synthesis. No LLM in the retrieval package (§2.2).
- `assemble()` already produces a ranked `UnifiedContext` with `sections[].items[]` each carrying `id`, `content`, `score`, `metadata` — i.e. citable candidates with node IDs.

### 4.4 Design
`amp_ask` = **retrieve → synthesize**:
1. Run the existing `assembler.assemble(question, { strategy:'ranked', ...scope })` to get ranked candidates (reuse everything — RRF, boosts, budgets).
2. Flatten `ctx.sections[].items[]` into a numbered evidence list `[n] (id) content`.
3. Call the LLM (synthesis model) with a strict prompt: answer the question **only** from the evidence, cite evidence numbers, say "insufficient evidence" if unsupported, and emit the cited node IDs.
4. Return the answer + the cited IDs + a compact evidence appendix.

**Reasoning levels** map to retrieval depth + synthesis budget + model:

| level | retrieval `max_tokens` | synthesis `maxTokens` | model | notes |
|---|---|---|---|---|
| `minimal` | 1500 | 256 | extraction model | terse factual lookup |
| `low` | 3000 | 400 | synthesis | |
| `medium` (default) | 6000 | 700 | synthesis | |
| `high` | 10000 | 1200 | synthesis | |
| `max` | 16000 | 2000 | synthesis | report-style |

Keep this table in one constant so it is the single source of truth.

### 4.5 Exact changes

**(a) New synthesis method on `UnifiedAssembler`** (`packages/retrieval/src/assembler.ts`):
- Add an optional `llm` to the constructor (default `null`):
  ```ts
  constructor(
    private driver: Driver,
    private redis: FeedbackRedisLayer,
    private codeLayer: AssemblerCodeLayer | null,
    private memoryLayer: AssemblerMemoryLayer | null,
    private embedding: EmbeddingProvider,
    private llm: import('@amp/core').LlmClient | null = null,   // NEW
  ) { ... }
  ```
- Add a method:
  ```ts
  async ask(question: string, opts: {
    level?: 'minimal'|'low'|'medium'|'high'|'max';
    entity_scope?: string[]; tag_scope?: string[]; project_name?: string; as_of?: string;
  } = {}): Promise<{ answer: string; cited_ids: string[]; evidence: ContextItem[]; level: string }> {
    if (!this.llm) throw new Error('amp_ask requires an LLM client (set OPENAI_API_KEY)');
    const lvl = ASK_LEVELS[opts.level ?? 'medium'];
    const ctx = await this.assemble(question, {
      strategy: 'ranked',
      max_tokens: lvl.retrievalTokens,
      entity_scope: opts.entity_scope, tag_scope: opts.tag_scope,
      project_name: opts.project_name, as_of: opts.as_of,
    });
    const evidence = ctx.sections.flatMap(s => s.items);
    if (evidence.length === 0) {
      return { answer: 'No relevant memory found to answer this question.', cited_ids: [], evidence: [], level: opts.level ?? 'medium' };
    }
    const numbered = evidence.map((it, i) => `[${i + 1}] (${it.id}) ${it.content}`).join('\n\n');
    const raw = await this.llm.chat([
      { role: 'system', content: ASK_SYSTEM_PROMPT },
      { role: 'user', content: `Question: ${question}\n\nEvidence:\n${numbered}` },
    ], { model: lvl.model, maxTokens: lvl.synthTokens, jsonMode: true });
    // Parse {answer, cited: number[]} — fall back to raw text + all ids on parse failure.
    const cited_ids = mapCitedToIds(raw, evidence);
    const answer = extractAnswer(raw);
    return { answer, cited_ids, evidence, level: opts.level ?? 'medium' };
  }
  ```
- Add the constants near the top of the file:
  ```ts
  const ASK_LEVELS = {
    minimal: { retrievalTokens: 1500,  synthTokens: 256,  model: undefined /* use extraction model id from config, see §9 */ },
    low:     { retrievalTokens: 3000,  synthTokens: 400,  model: undefined },
    medium:  { retrievalTokens: 6000,  synthTokens: 700,  model: undefined },
    high:    { retrievalTokens: 10000, synthTokens: 1200, model: undefined },
    max:     { retrievalTokens: 16000, synthTokens: 2000, model: undefined },
  } as const;
  const ASK_SYSTEM_PROMPT = `You are AMP's memory analyst. Answer the question USING ONLY the numbered evidence.
- Combine facts when needed and state the inference explicitly.
- Cite the evidence numbers you used.
- If the evidence is insufficient or conflicting, say so plainly. Do not invent facts.
Respond as JSON: {"answer": "...", "cited": [<evidence numbers>]}`;
  ```
  `ASK_LEVELS[*].model` left `undefined` means "let the LlmClient pick the per-task default"; override only when §9 config supplies explicit model ids. `mapCitedToIds`/`extractAnswer` are small local helpers (parse JSON, map `cited` numbers → `evidence[n-1].id`, dedupe; on any failure return the raw string and all evidence ids).

**(b) Expose on the service interface** (`packages/retrieval/src/tools.ts`):
- Extend `IUnifiedAssembler` with the `ask(...)` signature.
- Register `amp_ask` as a **Tier-1** tool inside `registerRetrievalTools`, mirroring `amp_context`:
  ```ts
  tier1.push(server.tool(
    'amp_ask',
    'Ask a natural-language question about everything in memory and get a synthesized, cited answer (not raw chunks). Combines facts via inference. reasoning_level (minimal|low|medium|high|max) trades latency for depth. Returns the answer plus the supporting node IDs.',
    {
      question: z.string().max(2000).describe('A natural-language question about the user/project/codebase memory'),
      reasoning_level: z.enum(['minimal','low','medium','high','max']).optional().default('medium'),
      entity_scope: z.array(z.string()).optional(),
      tag_scope: z.array(z.string()).optional(),
      project_name: z.string().max(2000).optional(),
      as_of: z.string().optional().describe('ISO 8601 — point-in-time question'),
    },
    { readOnlyHint: true, idempotentHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!assembler) throw new Error('Retrieval services not initialised');
      const r = await assembler.ask(args.question, {
        level: args.reasoning_level,
        entity_scope: args.entity_scope, tag_scope: args.tag_scope,
        project_name: args.project_name, as_of: args.as_of,
      });
      const md = [
        `# Answer`, ``, r.answer, ``,
        `**Reasoning level:** ${r.level} · **Cited:** ${r.cited_ids.length ? r.cited_ids.join(', ') : 'none'}`,
        ``, `## Evidence`,
        ...r.evidence.map((e, i) => `<!-- ${e.id} -->\n[${i + 1}] ${e.content}`),
      ].join('\n');
      return textContent(md);
    },
  ));
  ```
- Add `'amp_ask'` to `RETRIEVAL_TOOL_NAMES` (~L52).

**(c) Bootstrap** (`packages/mcp/src/bootstrap.ts` ~L269): pass the shared `llm` into the assembler:
```ts
const unifiedAssembler = new UnifiedAssembler(driver, feedbackRedis, codeSearchService, ampService, embedding, llm);
```
(`llm` comes from `createCoreServices` per §3.1; thread it out of `core`.)

**(d) `ask` must be in the injected interface** so `IUnifiedAssembler` is satisfied at the type level.

> **Tool surface decision:** `amp_ask` is Tier-1 (always on), like `amp_context`. That changes total tool count — update docs + drift guard (§10).

### 4.6 Optional follow-ups
- Feed the cited IDs back through `amp_feedback`/`FeedbackTracker.recordFeedback` so dialectic usage trains the learned weights (the tracker already exists; you'd extend `FeedbackSignal` with `cited_node_ids?` and record positive feedback for cited nodes). Defer to a second PR.
- Add an `amp ask` CLI subcommand (§2.8) for headless use.

### 4.7 Tests
- `packages/retrieval/src/__tests__/ask.test.ts`: stub `LlmClient` returning fixed JSON; feed a fake assembler context with 3 items; assert the answer text, that `cited_ids` map to real evidence IDs, and that empty-evidence returns the "no relevant memory" path. Assert `reasoning_level` selects the right `ASK_LEVELS` row (spy on `assemble`'s `max_tokens`).
- Registration: extend `packages/mcp/src/__tests__/tool-registration.regression.test.ts` to include `amp_ask` (handler is a function, not `{}`).
- Quality: optionally add an `amp_ask` scenario to `bench/membench/` for eyeball QA.

### 4.8 Risks
- **Hallucination.** Mitigated by JSON-mode + "use only evidence" prompt + returning evidence inline so the caller can verify. Keep temperature 0.
- **Latency/cost.** Bounded by `reasoning_level`. Default `medium`.
- **No API key.** `ask()` throws a clear error; the tool surfaces it. (Embeddings already degrade to zero vectors without a key, so retrieval still "works" but is weak — the thrown error is intentional for `amp_ask`.)

---

## 5. Feature: Split write-path + background "Dream" pass

### 5.1 Goal
Keep the *write path* cheap (explicit capture only — which AMP already does) and move *expensive, generative* reasoning to a scheduled background pass that, per scope: (a) finds entities with sparse or contradictory knowledge, (b) generates **abductive hypotheses** to fill gaps (low-confidence `tentative` facts, see §6), (c) surfaces coverage gaps, (d) optionally refreshes cards (§7). The existing signal→confidence→invalidation loop then confirms or kills the hypotheses over time.

### 5.2 Honcho reference
Honcho 3's **Dreaming Agent**: "crawls over everything known about a user, fills out missing pieces, rearranges data to be retrieved more efficiently," producing deductive/inductive/abductive inferences and **testable hypotheses**, ideally off-peak. Ingestion is reduced to "exhaustive *explicit* information" while the heavy reasoning moves to the dream. Study `src/deriver/` (the dream is a deriver task) and the Honcho 3 blog.

### 5.3 Current AMP state
- Background work today = consolidation (reactive clustering, §2.4), manual-trigger only. No gap-filling, no hypothesis generation, no scheduler.
- `amp_lint` (wiki domain, `packages/wiki/`) already computes **coverage_gaps**, **orphan_pages**, **missing_links**, **low_confidence**, **contradictions** — reuse this as the gap-detection signal source instead of reinventing it.
- `FactStore` can create `tentative` facts; consolidation already mints facts with `status:'tentative'` for net-new (`consolidation.ts` ~L437–454).

### 5.4 Design
New **`DreamEngine`** in `packages/core/src/dream.ts`. One `run(scope)` per project scope. Phases:

1. **Gather** (read-only): for the scope, collect
   - entities with `< K` active facts or with `disputed`/conflicting facts (query Neo4j; reuse `FactStore.getActive` per entity and the `amp_lint` checks);
   - low-confidence semantics/facts (below a threshold);
   - high-degree "hub" entities worth deepening (optional — `amp_graph_report` already computes weighted degree).
2. **Hypothesize** (LLM, dream model): for each gap, prompt the model with the entity's known facts + neighbors and ask for **abductive hypotheses** — plausible facts that would explain/connect the known ones, each with a self-rated plausibility. Strict JSON out. Cap N per entity (e.g. 3).
3. **Materialize** (write, serialized per entity via §8): for each hypothesis not already present (`findBySubjectPredicate` dedupe), create a `FactNode` with `status:'tentative'`, `inference_type:'abductive'` (§6), `confidence` in `[0.2, 0.35]`, `source_episode_ids: []`, `tags: [...scopeTags, 'dream']`. **Never** auto-invalidate existing active facts from a hypothesis.
4. **Cards** (optional, §7): refresh `project_card`/`user_card`.
5. **Report:** return `{ scope, gaps_found, hypotheses_created, cards_refreshed, skipped }` and `log` a summary.

**Idempotency & safety:**
- Tag every dream-minted fact `'dream'` and set `inference_type:'abductive'` so they are distinguishable, rankable-lower (§6), and never confused with explicit facts.
- Dedupe against existing facts (same `entity_id`+`predicate`+`object`) before creating.
- A hypothesis confirmed later by a real `amp_store` (explicit `active` deductive fact with same SPO) should **win**: the real path already invalidates conflicting objects; for *matching* SPO, the explicit fact reinforces — consider promoting the abductive fact's `inference_type` to `deductive` and bumping confidence when an explicit episode corroborates it (nice-to-have; can be a consolidation rule).
- **Budget the LLM**: cap entities processed per run (e.g. 25) and log what was skipped (no silent truncation).

**`DreamEngine` skeleton:**
```ts
// packages/core/src/dream.ts
import type { LlmClient } from './llm.js';
import type { AMPConfig, FactNode } from './types.js';

export interface DreamFactLayer {
  getActive(entityName: string): Promise<FactNode[]>;
  findBySubjectPredicate(subject: string, predicate: string): Promise<FactNode[]>;
  create(fact: FactNode): Promise<string>;
}
export interface DreamGraphLayer {
  // entities in scope, with a cheap fact-count, to find sparse/contradicted ones
  entitiesInScope(scopeTag: string, limit: number): Promise<Array<{ name: string; entity_id: string }>>;
}

export interface DreamResult {
  scope: string; gaps_found: number; hypotheses_created: number; skipped: number;
}

export class DreamEngine {
  constructor(
    private graph: DreamGraphLayer,
    private fact: DreamFactLayer,
    private llm: LlmClient,
    private config: AMPConfig,
    private serialize: <T>(key: string, fn: () => Promise<T>) => Promise<T>, // §8 mutex
  ) {}

  async run(scope: string, opts: { maxEntities?: number; perEntity?: number } = {}): Promise<DreamResult> {
    const maxEntities = opts.maxEntities ?? 25;
    const perEntity = opts.perEntity ?? 3;
    const entities = await this.graph.entitiesInScope(scope, maxEntities * 2);
    let gaps = 0, created = 0, skipped = 0;

    for (const e of entities.slice(0, maxEntities)) {
      const known = await this.fact.getActive(e.name);
      if (!isGap(known)) continue;          // sparse or contradicted
      gaps++;
      const hyps = await this.hypothesize(e.name, known, perEntity); // LLM
      for (const h of hyps) {
        const dup = await this.fact.findBySubjectPredicate(h.subject, h.predicate);
        if (dup.some(f => f.object === h.object)) { skipped++; continue; }
        await this.serialize(e.entity_id, () => this.fact.create(toAbductiveFact(h, scope)));
        created++;
      }
    }
    if (entities.length > maxEntities) {
      console.error(`[dream] scope=${scope}: processed ${maxEntities}/${entities.length} entities (capped)`);
    }
    return { scope, gaps_found: gaps, hypotheses_created: created, skipped };
  }

  private async hypothesize(entity: string, known: FactNode[], n: number) { /* LLM call, JSON out */ }
}
```
`isGap`, `toAbductiveFact` (sets `status:'tentative'`, `inference_type:'abductive'`, `confidence:0.3`, `tags:['dream']`), and the `DREAM_PROMPT` live in the same file. `DreamGraphLayer.entitiesInScope` is a thin new query in `packages/neo4j/src/` (e.g. add to `FactStore` or a new `DreamStore`): match `Entity` nodes reachable from a project entity / matching scope tags.

### 5.5 Trigger: CLI command + systemd timer

**CLI** (`packages/core/src/cli.ts`): add a `dream` case (and, while here, a `consolidate` case — both are background-pass entry points). Construct services via `createCoreServices()`:
```ts
case 'dream': {
  const core = createCoreServices();
  try {
    const engine = buildDreamEngine(core);              // wires DreamEngine from core services + llm
    const scope = String(flags['scope'] ?? 'project:global');
    const result = await engine.run(scope);
    console.log(JSON.stringify(result, null, 2));
  } finally { await core.close(); }
  break;
}
```
Add usage lines to the `default` help block (~L196–209). `buildDreamEngine` can live in `services-factory.ts` (it needs `driver`, `factStore`, `llm`, `config`, and a serializer from §8).

**systemd** — add two files under `deploy/systemd/` (mirror the wiki timer described in CLAUDE.md):

`deploy/systemd/amp-dream.service`
```ini
[Unit]
Description=AMP background dream pass (gap-filling + abductive hypotheses)
After=network.target neo4j.service redis-server.service

[Service]
Type=oneshot
User=cerebro
WorkingDirectory=/home/cerebro/projects/amp
EnvironmentFile=/home/cerebro/projects/amp/.env
ExecStart=/usr/bin/npx tsx packages/core/src/cli.ts dream --scope project:amp
TimeoutStartSec=600
```
`deploy/systemd/amp-dream.timer`
```ini
[Unit]
Description=Run the AMP dream pass nightly (off-peak)

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
Unit=amp-dream.service

[Install]
WantedBy=timers.target
```
> Run via `npx tsx packages/core/src/cli.ts`, NOT `node dist/cli.js`: the `@amp/*` workspace packages set `"exports".import -> ./src/index.ts` (dev runs on tsx; `dist/` holds only `.d.ts` type declarations), so `node` cannot resolve the source exports. This matches `npm run dev` and the readyz check. Document install: `systemctl --user enable --now amp-dream.timer` (or system scope, matching how `amp-wiki-compile.timer` is installed on this host). One service per scope, or pass multiple `--scope` runs.

### 5.6 Optional: also expose via `amp_consolidate`
Add a `dream` action to `AmpConsolidateSchema`/handler (`mcp/tools.ts` ~L216, ~L781) so an agent can trigger a scoped dream on demand: `amp_consolidate(action:'dream', scope:'project:amp')`. This reuses the admin domain (no new Tier-1 tool, no count change). Inject a `dreamEngine` into the consolidation adapter, or add a dedicated injected service.

### 5.7 Tests
- `packages/core/src/__tests__/dream.test.ts`: fake `DreamGraphLayer`/`DreamFactLayer` + stub `LlmClient`. Assert: sparse entity triggers hypotheses; duplicates are skipped (no double create); created facts have `status:'tentative'`, `inference_type:'abductive'`, `tags` include `'dream'`; capping logs and limits writes; serializer is invoked per entity_id.
- Regression: a dream run must **never** call `invalidate`/`dispute` on existing facts (assert those layer methods are not called).

### 5.8 Risks
- **Graph pollution.** Biggest risk. Mitigations: low confidence, `tentative` status, `'dream'` tag, `abductive` inference_type → ranked low and visually flagged; per-run caps; dedupe. Provide an escape hatch: a `amp query`/script to bulk-delete `:Fact {inference_type:'abductive', status:'tentative'}` older than N days that never gained a corroborating signal (a "dream GC").
- **Cost.** Capped entities/run + off-peak timer.
- **Confirmation loop.** Define clearly: an explicit episode that yields the same SPO should upgrade the hypothesis (inference_type → deductive, confidence bump). Implement as a check in `_extractFactsBackground` (when `reinforcing` fact found and it's abductive, upgrade it) — small, high-value.

---

## 6. Feature: `inference_type` on facts + abductive hypotheses

### 6.1 Goal
Distinguish how a fact came to be known: **deductive** (explicitly stated/derived), **inductive** (generalized from patterns), **abductive** (a best-guess hypothesis). This (a) lets retrieval/ranking treat guesses as guesses, and (b) gives the dream pass (§5) a first-class output type that the existing confidence/invalidation machinery already understands.

### 6.2 Honcho reference
Honcho tags conclusions deductive/inductive/abductive and the Dreaming Agent "forms testable hypotheses" (Honcho 3 blog). AMP already has `tentative` status and (in the research domain) hypotheses — this brings the inference dimension into *general* memory.

### 6.3 Exact changes (small, additive, backward-compatible)

**(a) Type** — `packages/core/src/types.ts`:
```ts
export type InferenceType = 'deductive' | 'inductive' | 'abductive';
```
Add to `FactNode` (~L166–184): `inference_type?: InferenceType;` (optional → existing facts/readers unaffected). Add to `FactInput` (~L186–195): `inference_type?: InferenceType;`.

**(b) Write path** — `packages/neo4j/src/fact.ts`:
- In `create()` CREATE Cypher (~L24–59) add `inference_type: $inference_type,` and to params `inference_type: fact.inference_type ?? 'deductive',` (default makes legacy + explicit facts deductive).
- In `mapFactNode()` (~L388–408) add: `inference_type: typeof props.inference_type === 'string' ? (props.inference_type as InferenceType) : 'deductive',`.

**(c) Schema** — `packages/neo4j/src/schema.ts`: add alongside the other fact indexes (~L21–26):
```ts
'CREATE INDEX fact_inference_type IF NOT EXISTS FOR (f:Fact) ON (f.inference_type)',
```
(Schema init is idempotent `IF NOT EXISTS`; no migration script needed. Existing rows simply lack the property and read back as `'deductive'`.)

**(d) Creation sites set the right type:**
- Real-time explicit extraction in `service.ts` `_extractFactsBackground` (~L499–517): set `inference_type: 'deductive'` on the new `FactNode`.
- Consolidation extraction in `consolidation.ts` `_extractAndStoreFacts` (~L416, ~L437): these are derived-from-consolidated-knowledge → `inference_type: 'inductive'` (generalized across episodes) is the honest label; `'deductive'` is also defensible. Pick `'inductive'` and document it.
- Dream pass (§5): `'abductive'`.

**(e) Ranking** — `packages/core/src/ranking.ts`: extend `rankFacts` to multiply by an inference weight so guesses sort below knowns:
```ts
const FACT_INFERENCE_MULTIPLIER = { deductive: 1.0, inductive: 0.85, abductive: 0.5 };
// score = confidence * recencyScore * FACT_STATUS_MULTIPLIER[status] * (FACT_INFERENCE_MULTIPLIER[fact.inference_type ?? 'deductive'])
```

**(f) Rendering** — `packages/core/src/service.ts` `renderFactsMarkdown` (~L680–708): annotate non-deductive facts, e.g. append ` [hypothesis]` for abductive and ` [inferred]` for inductive, so a reading agent knows it's a guess. Keep deductive unannotated.

**(g) Temporal/diff surfaces** (optional): `amp_timeline`/`amp_fact_diff` could include `inference_type`. Low priority.

### 6.4 Tests
- `packages/neo4j/src/__tests__/fact.test.ts` (or the existing fact test): create with each inference_type, read back, assert round-trip; assert default `'deductive'` when omitted (covers legacy rows).
- `ranking.temporal.test.ts` / `ranking.test.ts`: assert abductive ranks below deductive at equal confidence.
- Add a `consolidation` test asserting consolidation-minted facts carry `'inductive'`.

### 6.5 Risks
- Minimal — purely additive optional field with a safe default. The only behavioral change is ranking (intended). Confirm no code does a strict equality on the full `FactNode` shape in tests (search `__tests__` for object-literal fact comparisons and update if needed).

---

## 7. Feature: Auto-derived "cards"

### 7.1 Goal
Auto-generate and refresh a compact identity/summary block per scope (`project_card`, and `user_card` for the user scope) so high-signal context is injected with zero LLM round-trip at load time. AMP's `user`/`persona`/`project_state` core blocks are the same idea but **hand-maintained**; this makes one of them self-updating.

### 7.2 Honcho reference
Honcho's **Peer Cards** — compact identity summaries derived by the deriver, used for low-latency injection. And **Representation Snapshots** — static low-latency docs. (Architecture docs + Honcho 3 blog.)

### 7.3 Current AMP state
- Core blocks are auto-loaded by `AMPService.load()` and rendered under `## Core Memory`, sharing the 15% core budget (§2.6).
- `MemoryBlockService.rewrite(scope, name, content)` overwrites a block; `read` fetches it. Core blocks persist in Neo4j.

### 7.4 Design
Add a **card generation step** that runs inside the dream pass (§5, phase 4) and/or at consolidation end:
1. Pull, for the scope: the top-N high-confidence semantics + top-N active deductive facts + most-recent episodes summary signals.
2. LLM (dream/synthesis model) condenses to a tight markdown card (≤ ~200 tokens) — identity, stable preferences, current objective, key conventions.
3. `memoryBlocks.rewrite(scope, 'project_card', cardMarkdown)` (core tier). For the user scope, `'user_card'`.

**Decisions:**
- Register `project_card` (and optionally `user_card`) in `DEFAULT_BLOCKS` (`types.ts` ~L246–253) as `tier:'core'` so it's a known block. *Do not* overwrite the human-authored `user`/`project_state` blocks — cards are separate, machine-owned blocks. This preserves the "never silently drop human content" rule.
- **Budget interaction:** cards consume the core 15% budget. Keep cards short and ensure `truncateBlocksToTokenBudget` (`service.ts` ~L837) orders machine cards *after* human blocks (or give cards their own sub-cap) so a verbose card can't crowd out the human `user` block. Simplest: cap card length at generation time.
- Mark card content with a leading machine-owned marker comment (e.g. `<!-- amp:card auto-generated -->`) so the wiki round-trip/editing (`amp_wiki_sync`) and humans know it's regenerated each pass.

### 7.5 Exact changes
- `packages/core/src/dream.ts`: add `refreshCards(scope)` using `MemoryBlockService` + `LlmClient`. Wire into `DreamEngine.run` phase 4 (behind an opt-in flag `opts.cards !== false`).
- `packages/core/src/types.ts`: append `{ name:'project_card', tier:'core', description:'Auto-generated compact project summary' }` (and `user_card`) to `DEFAULT_BLOCKS`.
- `packages/core/src/service.ts`: in `truncateBlocksToTokenBudget`/`renderBlocksMarkdown`, ensure deterministic ordering with human blocks first, then `*_card`. (Sort core blocks so `*_card` sinks to the bottom.)

### 7.6 Tests
- `dream.test.ts`: stub LLM returns a card; assert `rewrite` called with `'project_card'`, core tier, content under cap, and that `user`/`project_state` are untouched.
- `blocks.test.ts`/`service.test.ts`: assert load renders the card and that a long card cannot evict the human `user` block (ordering/cap).

### 7.7 Risks
- **Overwriting human content** — avoided by using separate `*_card` blocks. **Budget crowding** — avoided by length cap + ordering. **Staleness** — card regenerates every dream pass; include the generation timestamp in the card.

---

## 8. Feature: Per-entity serialization

### 8.1 Goal
Guarantee that concurrent writes affecting **the same entity** (dream materialization, consolidation fact writes, background extraction) are serialized, mirroring Honcho's "tasks affecting the same peer representation are processed serially in message order; different peers in parallel." This prevents logical races (e.g. two passes both creating the same hypothesis, or invalidate/create interleaving) — the *logical* analogue of the recent Neo4j single-session fix (§2.10).

### 8.2 Design — in-process keyed mutex
A tiny utility (no new infra). Place in `packages/core/src/serial-queue.ts`:
```ts
// Serializes async work per key; different keys run concurrently.
export class KeyedSerialQueue {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    // keep the map from growing unboundedly: clear when this is the tail
    this.tails.set(key, next);
    void next.finally(() => { if (this.tails.get(key) === next) this.tails.delete(key); });
    return next;
  }
}
```
Key by `entity_id` (canonical). The dream pass already calls `this.serialize(e.entity_id, () => fact.create(...))` (§5.4). Inject a single shared `KeyedSerialQueue` from `createCoreServices`.

**Scope of use (keep it minimal and correct):**
- **Use now:** dream materialization writes (§5).
- **Consider:** `_extractFactsBackground` and consolidation `_extractAndStoreFacts` for the same entity. These are already mostly serial per call; the win is cross-pass (dream vs. extraction touching one entity at once). Add only if you observe contention.
- **Out of scope:** this is single-process (the MCP server + the cron CLI are *different* processes). For cross-process safety on the same entity, rely on the existing **Redis `DistributedLock`** (`packages/redis`, used by `ConsolidationEngine` per scope). If dream and consolidation can run concurrently across processes, have the dream pass acquire the **same scope lock** the consolidation engine uses (`lock.acquire(scope, holder)`), so they can't both mutate a scope simultaneously. **Recommended:** wrap `DreamEngine.run(scope)` in the scope-level `DistributedLock` (cross-process) **and** use `KeyedSerialQueue` per entity within the run (in-process). Document this two-level locking.

### 8.3 Tests
- `serial-queue.test.ts`: interleave two `run(samekey)` tasks with delays; assert strict ordering. Assert different keys run concurrently. Assert a throwing task doesn't wedge the key (next task still runs).

### 8.4 Risks
- A keyed mutex that never deletes entries leaks memory — the `finally`-delete above handles it. Don't hold the mutex across the LLM call (only across the DB writes) or you serialize the slow part unnecessarily.

---

## 9. Feature: Tiered models per task

### 9.1 Goal
Let extraction stay cheap (`gpt-4o-mini`) while synthesis (`amp_ask`) and dreaming use a stronger model — all config-driven, no hardcoding.

### 9.2 Exact changes
**(a) Config type** — `packages/core/src/types.ts` `AMPConfig` (~L127–134), add:
```ts
models?: {
  extraction?: string;   // default 'gpt-4o-mini'
  synthesis?: string;    // default 'gpt-4o'
  dream?: string;        // default 'gpt-4o'
};
```
**(b) Resolution** — `packages/core/src/services-factory.ts`: read overrides from env (`AMP_MODEL_EXTRACTION`, `AMP_MODEL_SYNTHESIS`, `AMP_MODEL_DREAM`) in `resolveEnv`/config construction, and pass `config.models` into `new OpenAiLlmClient(openaiKey, resolvedModels)` (§3.1). Provide `DEFAULT_MODELS` fallback.
**(c) `.env.example`** — document the three new optional vars.
**(d) extract.ts** — give `extractFacts` an optional model override so the extraction tier is honored:
```ts
export async function extractFacts(content: string, apiKey: string, model = 'gpt-4o-mini'): Promise<FactInput[]> { ... model ... }
```
Update the two call sites (`service.ts`, `consolidation.ts`) to pass `config.models?.extraction ?? 'gpt-4o-mini'`. **Backward compatible** (default arg).

### 9.3 Tests
- `services-factory` test (or a small config test): env overrides land in `config.models`; defaults apply when unset.
- `extract` test: model arg is forwarded to the client.

### 9.4 Risks
- A bad model id surfaces as an API error at call time — acceptable; log clearly. Keep extraction default unchanged so existing behavior/cost is identical unless explicitly overridden.

---

## 10. Cross-cutting: docs, drift guard, and counts

Adding `amp_ask` changes the **Tier-1 tool set** and total tool count (currently documented as **48 tools / 9 domains** in `CLAUDE.md`). Adding the `dream` action to `amp_consolidate` does **not** add a tool. Before committing:

1. **`packages/mcp/src/tools.ts`** — if `amp_ask` is registered in the **retrieval** package, ensure the gateway's accounting still lines up: `amp_ask` is Tier-1, so it belongs with `amp_context` (also Tier-1, retrieval-owned). Confirm whether any count/list in `tools.ts` enumerates Tier-1 names and update.
2. **Drift-guard test** — there is a regression test that asserts documented tool counts/names match the registered surface (added in a prior "agent-facing docs reconciliation" pass). `grep -rn "48\|tool.*count\|ALWAYS_ON_TOOL_NAMES\|drift" packages/mcp/src/__tests__` and update expected values (49 tools, new Tier-1 name `amp_ask`).
3. **Agent-facing docs** — update the tool tables and counts in: `CLAUDE.md`, `CLAUDE.md.example`, `README.md`, `GEMINI.md(.example)`, `.cursorrules`, and any skill docs under `skills/` / `.claude/` that enumerate tools. Search: `grep -rln "amp_context" --include=*.md .` and add `amp_ask` next to it; bump "48"→"49".
4. **`.env.example`** — add `AMP_MODEL_*` vars (§9) and note the dream timer.
5. **Tool-registration regression** — extend `tool-registration.regression.test.ts` so `amp_ask` is covered by the "handler is a function" guard.

---

## 11. Consolidated file-change index

| File | Feature(s) | Change |
|---|---|---|
| `packages/core/src/llm.ts` *(new)* | 3.1 | Shared `LlmClient` (`OpenAiLlmClient`, `NullLlmClient`, `DEFAULT_MODELS`) |
| `packages/core/src/index.ts` | 3.1 | Export llm module |
| `packages/core/src/services-factory.ts` | 3.1, 5, 8, 9 | Build `llm`, `KeyedSerialQueue`, `config.models`, `buildDreamEngine`; return in `CoreServices` |
| `packages/core/src/types.ts` | 6, 7, 9 | `InferenceType`; `FactNode.inference_type?`; `FactInput.inference_type?`; `AMPConfig.models?`; add `*_card` to `DEFAULT_BLOCKS` |
| `packages/neo4j/src/fact.ts` | 6 | `create` Cypher+params add `inference_type`; `mapFactNode` default `'deductive'` |
| `packages/neo4j/src/schema.ts` | 6 | `fact_inference_type` index |
| `packages/core/src/ranking.ts` | 6 | `FACT_INFERENCE_MULTIPLIER` in `rankFacts` |
| `packages/core/src/service.ts` | 6, 7 | `_extractFactsBackground` sets `inference_type:'deductive'` (+ upgrade-on-corroboration, §5.8); `renderFactsMarkdown` annotates; card ordering in block budget |
| `packages/core/src/consolidation.ts` | 6 | `_extractAndStoreFacts` sets `inference_type:'inductive'` |
| `packages/core/src/extract.ts` | 9 | optional `model` arg |
| `packages/retrieval/src/assembler.ts` | 4 | `llm` ctor param; `ask()` method; `ASK_LEVELS`/`ASK_SYSTEM_PROMPT` |
| `packages/retrieval/src/tools.ts` | 4 | `IUnifiedAssembler.ask`; register Tier-1 `amp_ask`; add to `RETRIEVAL_TOOL_NAMES` |
| `packages/mcp/src/bootstrap.ts` | 3.1, 4, 5 | thread `llm` into `UnifiedAssembler`; inject `dreamEngine`/serializer; optional `amp_consolidate` dream action |
| `packages/mcp/src/tools.ts` | 5 (opt) | `amp_consolidate` `dream` action; count/drift updates |
| `packages/core/src/dream.ts` *(new)* | 5, 7 | `DreamEngine`, gap detection, hypothesize, materialize, `refreshCards` |
| `packages/core/src/serial-queue.ts` *(new)* | 8 | `KeyedSerialQueue` |
| `packages/neo4j/src/*` (dream store) | 5 | `entitiesInScope` query |
| `packages/core/src/cli.ts` | 5 | `dream` (+ `consolidate`) command + help |
| `deploy/systemd/amp-dream.{service,timer}` *(new)* | 5 | scheduled nightly dream |
| `.env.example` | 9, 5 | `AMP_MODEL_*`, dream notes |
| `CLAUDE.md`, `README.md`, `*.example`, skills | 4, 10 | tool tables + counts |
| `__tests__/*` across packages | all | see per-feature test subsections |

---

## 12. Honcho → AMP concept mapping (appendix)

| Honcho | AMP equivalent (after this plan) |
|---|---|
| Dialectic / Chat endpoint | `amp_ask` (§4) |
| Reasoning levels minimal→max | `amp_ask` `reasoning_level` → `ASK_LEVELS` (§4.4) |
| Deriver (explicit ingestion) | `amp_store` + `_extractFactsBackground` (already cheap & explicit) |
| Dreaming Agent (gaps, hypotheses, reorg) | `DreamEngine` (§5) |
| Deductive/inductive/abductive | `FactNode.inference_type` (§6) |
| Testable hypotheses | abductive `tentative` facts; confirmed/killed by signal→confidence loop |
| Peer Cards / Representation Snapshots | auto-derived `project_card`/`user_card` core blocks (§7) |
| Serial-per-peer processing | `KeyedSerialQueue` per entity + scope `DistributedLock` (§8) |
| Multi-provider models per task | `AMPConfig.models` + `OpenAiLlmClient` (§9) |
| Global vs Local representations (theory of mind across peers) | **Out of scope** — AMP is project/agent-centric, not peer-symmetric. Revisit only for multi-agent-divergent-belief scenarios. |
| Recursive short/long session summaries | **Out of scope** — AMP works at episode granularity; consolidation + cards cover the need. |

---

## 13. Definition of done

- [ ] §3.1 LlmClient + tests; wired through `createCoreServices`.
- [ ] §9 model config + env + tests.
- [ ] §6 `inference_type` end-to-end (type, Cypher, schema index, mapFactNode, ranking, render) + tests; legacy facts read as `deductive`.
- [ ] §4 `amp_ask` Tier-1 tool returns synthesized, cited answers; reasoning levels honored; registration + ask tests; docs/counts/drift updated.
- [ ] §5 `DreamEngine` + CLI `dream` + systemd timer; mints abductive tentative facts; capped + logged; never invalidates explicit facts; tests.
- [ ] §8 `KeyedSerialQueue` + scope lock around dream writes; tests.
- [ ] §7 auto cards refreshed in dream pass without clobbering human blocks; tests.
- [ ] All agent-facing docs + drift guard updated; `npm run build` clean; `npm run test --workspaces` green.
- [ ] Manual smoke: `npx tsx packages/core/src/cli.ts dream --scope project:amp` then `amp_ask("what does the user prefer for X?")` returns a cited answer.

> Reminder: keep all commit messages, branch names, and PR text in plain developer language — no AI/assistant/automation attribution, no `Co-Authored-By` trailers.
