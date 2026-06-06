// packages/core/src/dream.ts
//
// The "dream" pass — Honcho-inspired background reasoning. Where consolidation is
// REACTIVE (cluster what was explicitly stored), the dream pass is GENERATIVE: it
// crawls entities in a scope, finds ones with sparse or contradicted knowledge,
// and mints low-confidence ABDUCTIVE hypotheses (status 'tentative') that the
// existing signal -> confidence -> invalidation loop later confirms or kills.
//
// Safety invariants (enforced + tested):
//   - NEVER invalidates or disputes existing facts. Only CREATEs new tentative ones.
//   - Every minted fact is inference_type 'abductive', status 'tentative', low
//     confidence, and tagged 'dream' — so it ranks low and is visibly a guess.
//   - Dedupe against existing (entity, predicate, object) before creating.
//   - Per-run entity cap; what was skipped is logged (no silent truncation).
//   - Writes per entity go through a serializer (KeyedSerialQueue) so concurrent
//     passes can't interleave writes to one entity.

import { nanoid } from 'nanoid';
import type { AMPConfig, FactNode, FactScope } from './types.js';
import type { LlmClient } from './llm.js';

// ─── Injected dependency interfaces ──────────────────────────────────────────

export interface DreamFactLayer {
  getActive(entityName: string): Promise<FactNode[]>;
  findBySubjectPredicate(subject: string, predicate: string): Promise<FactNode[]>;
  create(fact: FactNode): Promise<string>;
}

export interface DreamEntity {
  name: string;
  entity_id: string;
}

export interface DreamGraphLayer {
  /** Entities reachable in this project scope, for gap scanning. */
  entitiesInScope(scopeTag: string, limit: number): Promise<DreamEntity[]>;
}

export interface DreamBlockLayer {
  read(scope: string, name: string): Promise<{ content: string } | null>;
  rewrite(scope: string, name: string, content: string): Promise<unknown>;
}

export interface DreamLock {
  acquire(scope: string, holder: string, ttlSeconds?: number): Promise<boolean>;
  release(scope: string, holder: string): Promise<boolean>;
}

export interface DreamEngineDeps {
  graph: DreamGraphLayer;
  fact: DreamFactLayer;
  llm: LlmClient;
  /** Optional — when present, the dream pass refreshes the project_card block. */
  blocks?: DreamBlockLayer | null;
  config: AMPConfig;
  /** Per-entity serializer (KeyedSerialQueue.run). Defaults to no serialization. */
  serialize?: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  /**
   * Cross-process scope lock (the same Redis DistributedLock the ConsolidationEngine
   * uses). When present, run() holds the scope lock so dream and consolidation can't
   * mutate one scope concurrently. Optional — omitted in unit tests / single-process.
   */
  lock?: DreamLock | null;
}

export interface DreamResult {
  scope: string;
  llm_available: boolean;
  /** True when the run was skipped because another process held the scope lock. */
  lock_skipped: boolean;
  entities_scanned: number;
  gaps_found: number;
  hypotheses_created: number;
  hypotheses_skipped: number;
  cards_refreshed: number;
}

// ─── Tunables ────────────────────────────────────────────────────────────────

const MAX_ENTITIES = 25;          // entities processed per run (cost cap)
const PER_ENTITY = 3;             // hypotheses requested per gap entity
const MIN_FACTS_FOR_COVERAGE = 3; // fewer active facts than this => sparse => gap
const DREAM_CONFIDENCE = 0.3;     // low: a guess, not a known fact
const CARD_MARKER = '<!-- amp:card auto-generated -->';
const CARD_MAX_CHARS = 900;

const DREAM_SYSTEM_PROMPT = `You are AMP's background reasoning ("dream") agent. Given what is already known about an entity, propose ABDUCTIVE hypotheses: plausible additional facts that would best explain or connect the known facts. These are guesses to be confirmed later, not assertions.

Rules:
- Each hypothesis is a subject-predicate-object triple ABOUT the given entity (use the entity name as the subject).
- Use concise canonical predicates (e.g. uses, depends_on, implements, prefers, located_at, owns, is, has, produces, consumes, configured_as).
- Do NOT restate facts already known. Propose genuinely new, plausible connections.
- If nothing plausible can be hypothesized, return an empty array.

Respond as JSON only:
{"hypotheses": [{"subject": "...", "predicate": "...", "object": "...", "rationale": "..."}]}`;

const CARD_SYSTEM_PROMPT = `You write a TERSE project memory card: a compact, durable summary an agent reads at the start of every session. Given known facts, produce <=150 words of markdown covering identity, stable conventions/preferences, and key components. No preamble, no headings beyond short bold labels. Be concrete; omit anything uncertain.`;

// ─── Engine ──────────────────────────────────────────────────────────────────

export class DreamEngine {
  private readonly lockHolder = `dream-${nanoid(8)}`;

  constructor(private deps: DreamEngineDeps) {}

  async run(
    scope: string,
    opts: { maxEntities?: number; perEntity?: number; cards?: boolean } = {},
  ): Promise<DreamResult> {
    const result: DreamResult = {
      scope,
      llm_available: this.deps.llm.available,
      lock_skipped: false,
      entities_scanned: 0,
      gaps_found: 0,
      hypotheses_created: 0,
      hypotheses_skipped: 0,
      cards_refreshed: 0,
    };

    if (!this.deps.llm.available) {
      console.error(`[dream] scope=${scope}: no LLM configured (set OPENAI_API_KEY) — skipping`);
      return result;
    }

    // Cross-process scope lock: dream and consolidation must not mutate one scope
    // at once. Held for the whole run; released in the finally below.
    if (this.deps.lock) {
      const acquired = await this.deps.lock.acquire(scope, this.lockHolder);
      if (!acquired) {
        console.error(`[dream] scope=${scope}: scope lock held by another process — skipping`);
        result.lock_skipped = true;
        return result;
      }
    }

    try {
      return await this._run(scope, opts, result);
    } finally {
      if (this.deps.lock) {
        try { await this.deps.lock.release(scope, this.lockHolder); } catch { /* best-effort */ }
      }
    }
  }

  private async _run(
    scope: string,
    opts: { maxEntities?: number; perEntity?: number; cards?: boolean },
    result: DreamResult,
  ): Promise<DreamResult> {
    const maxEntities = opts.maxEntities ?? MAX_ENTITIES;
    const perEntity = opts.perEntity ?? PER_ENTITY;
    const serialize = this.deps.serialize ?? (<T>(_k: string, fn: () => Promise<T>) => fn());

    let candidates: DreamEntity[] = [];
    try {
      candidates = await this.deps.graph.entitiesInScope(scope, maxEntities * 2);
    } catch (err) {
      console.error(`[dream] scope=${scope}: entitiesInScope failed:`, err instanceof Error ? err.message : err);
      return result;
    }

    const collectedFacts: FactNode[] = [];
    const toProcess = candidates.slice(0, maxEntities);

    for (const entity of toProcess) {
      result.entities_scanned++;
      let known: FactNode[];
      try {
        known = await this.deps.fact.getActive(entity.name);
      } catch (err) {
        console.error(`[dream] getActive(${entity.name}) failed:`, err instanceof Error ? err.message : err);
        continue;
      }
      collectedFacts.push(...known);

      if (!isGap(known)) continue;
      result.gaps_found++;

      let hypotheses: Hypothesis[] = [];
      try {
        hypotheses = await this.hypothesize(entity.name, known, perEntity);
      } catch (err) {
        console.error(`[dream] hypothesize(${entity.name}) failed:`, err instanceof Error ? err.message : err);
        continue;
      }

      for (const h of hypotheses) {
        // Dedupe: skip if an active fact with the same (entity, predicate, object) exists.
        let existing: FactNode[] = [];
        try {
          existing = await this.deps.fact.findBySubjectPredicate(h.subject, h.predicate);
        } catch { /* treat as no match */ }
        if (existing.some((f) => f.object.toLowerCase() === h.object.toLowerCase())) {
          result.hypotheses_skipped++;
          continue;
        }
        const fact = toAbductiveFact(h, scope);
        try {
          await serialize(entity.entity_id, () => this.deps.fact.create(fact));
          result.hypotheses_created++;
        } catch (err) {
          console.error(`[dream] create hypothesis for ${entity.name} failed:`, err instanceof Error ? err.message : err);
          result.hypotheses_skipped++;
        }
      }
    }

    if (candidates.length > maxEntities) {
      console.error(`[dream] scope=${scope}: processed ${maxEntities}/${candidates.length} entities (capped); ${candidates.length - maxEntities} skipped`);
    }

    // Card refresh (opt-out via cards:false). Never throws out of run().
    if (opts.cards !== false && this.deps.blocks) {
      try {
        const n = await this.refreshCards(scope, collectedFacts);
        result.cards_refreshed = n;
      } catch (err) {
        console.error(`[dream] refreshCards(${scope}) failed:`, err instanceof Error ? err.message : err);
      }
    }

    return result;
  }

  private async hypothesize(entity: string, known: FactNode[], n: number): Promise<Hypothesis[]> {
    const knownLines = known.length
      ? known.map((f) => `- ${f.subject} ${f.predicate} ${f.object}`).join('\n')
      : '(no facts known yet)';
    const raw = await this.deps.llm.chat(
      [
        { role: 'system', content: DREAM_SYSTEM_PROMPT },
        { role: 'user', content: `Entity: ${entity}\nUp to ${n} hypotheses.\n\nKnown facts:\n${knownLines}` },
      ],
      { model: this.deps.llm.modelFor('dream'), jsonMode: true, maxTokens: 600 },
    );
    return parseHypotheses(raw, entity).slice(0, n);
  }

  private async refreshCards(scope: string, facts: FactNode[]): Promise<number> {
    const blocks = this.deps.blocks;
    if (!blocks) return 0;
    // Rank by confidence and keep the most informative active, explicitly-known
    // (deductive) facts. Inductive/abductive (generalized or hypothesized) facts
    // are excluded so the card reflects what is actually known, not guessed.
    const top = facts
      .filter((f) => f.status === 'active' && (f.inference_type ?? 'deductive') === 'deductive')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 30);
    if (top.length === 0) return 0;

    const factLines = top.map((f) => `- ${f.subject} ${f.predicate} ${f.object}`).join('\n');
    const card = await this.deps.llm.chat(
      [
        { role: 'system', content: CARD_SYSTEM_PROMPT },
        { role: 'user', content: `Scope: ${scope}\n\nKnown facts:\n${factLines}` },
      ],
      { model: this.deps.llm.modelFor('dream'), maxTokens: 400 },
    );
    const trimmed = card.trim();
    if (!trimmed) return 0;

    const now = new Date().toISOString().split('T')[0];
    const content = `${CARD_MARKER} (${now})\n${trimmed.slice(0, CARD_MAX_CHARS)}`;
    await blocks.rewrite(scope, 'project_card', content);
    return 1;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Hypothesis {
  subject: string;
  predicate: string;
  object: string;
  rationale?: string;
}

/** An entity is a "gap" if it has few active facts or any disputed fact. */
export function isGap(known: FactNode[]): boolean {
  const active = known.filter((f) => f.status === 'active');
  if (active.length < MIN_FACTS_FOR_COVERAGE) return true;
  if (known.some((f) => f.status === 'disputed')) return true;
  return false;
}

function parseHypotheses(raw: string, entity: string): Hypothesis[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const arr = (parsed as Record<string, unknown>).hypotheses;
  if (!Array.isArray(arr)) return [];
  const out: Hypothesis[] = [];
  let dropped = 0;
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) { dropped++; continue; }
    const o = item as Record<string, unknown>;
    const predicate = typeof o.predicate === 'string' ? o.predicate.trim() : '';
    const object = typeof o.object === 'string' ? o.object.trim() : '';
    if (!predicate || !object) { dropped++; continue; }
    // Force the subject to the scanned entity so hypotheses are always about it.
    const subject = typeof o.subject === 'string' && o.subject.trim() ? o.subject.trim() : entity;
    out.push({
      subject,
      predicate,
      object,
      ...(typeof o.rationale === 'string' ? { rationale: o.rationale } : {}),
    });
  }
  // No silent truncation: surface what the LLM produced that we couldn't use.
  if (dropped > 0) {
    console.error(`[dream] ${entity}: dropped ${dropped} malformed hypothesis object(s) from LLM output`);
  }
  return out;
}

function toAbductiveFact(h: Hypothesis, scope: string): FactNode {
  const now = new Date().toISOString();
  const scopeTag = scope.startsWith('project:') ? scope : `project:${scope}`;
  const factScope: FactScope = 'project';
  return {
    id: `fact-${nanoid(12)}`,
    subject: h.subject,
    predicate: h.predicate,
    object: h.object,
    entity_id: null,
    source_episode_ids: [],
    valid_at: now,
    invalid_at: null,
    confidence: DREAM_CONFIDENCE,
    status: 'tentative',
    inference_type: 'abductive',
    supersedes_fact_id: null,
    scope: factScope,
    tags: ['dream', scopeTag],
    created_at: now,
    updated_at: now,
  };
}
