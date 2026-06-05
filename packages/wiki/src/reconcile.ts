// packages/wiki/src/reconcile.ts
// Round-trip editing: take an edited wiki article and reconcile human changes
// back into the Neo4j graph as claim-level signals.
//
//   - changed claim (anchored, text differs) -> new human-authored Semantic that
//     SUPERSEDES the old one, ABOUT edges re-linked, + a CORRECTS signal episode.
//   - new block (no anchor, under a domain section) -> new human-authored Semantic
//     linked ABOUT the article entity.
//   - removed claim (anchor present in the on-disk original but gone from the edit)
//     -> confidence penalty + a CORRECTS signal episode. Never hard-deleted.
//
// Removal detection requires the pre-edit text (`original_md`); the web edit UI has
// it (the file on disk). The agent/CLI sync path passes only the edited file, so it
// reconciles changes + additions against the graph and skips removals.

import neo4j, { type Driver } from 'neo4j-driver';
import { nanoid } from 'nanoid';
import { SemanticStore, EpisodicStore } from '@amp/neo4j';
import type { SemanticNode } from '@amp/core';
import { CLAIM_ANCHOR_RE } from './renderers.js';

// Section headings that are NOT domain claim sections — text typed under these is
// never treated as a new claim.
const NON_CLAIM_SECTIONS = new Set([
  'key decisions', 'history', 'sources', 'see also', 'referenced by', 'graph',
]);

export interface ReconcileInput {
  /** Project tag to scope new claims (e.g. "project:user-personal"). */
  project_tag: string;
  /** The edited markdown (post-edit). */
  edited_md: string;
  /** The pre-edit markdown. When provided, enables removal detection. */
  original_md?: string;
  /** Neo4j driver. Optional — the reconciler instance already holds one. */
  driver?: Driver;
  /** Session id for provenance episodes (generated if omitted). */
  session_id?: string;
}

export interface ReconcileChange {
  action: 'corrected' | 'added' | 'removed' | 'unchanged';
  semantic_id?: string;
  new_id?: string;
  text: string;
}

export interface ReconcileResult {
  entity: string | null;
  entity_id: string | null;
  corrected: number;
  added: number;
  removed: number;
  unchanged: number;
  details: ReconcileChange[];
}

interface ClaimBlock {
  /** Semantic id from the anchor, or null for a newly-typed block. */
  anchorId: string | null;
  /** The claim text with confidence line + anchor stripped. */
  text: string;
}

// ─── Markdown parsing ──────────────────────────────────────────────────────────

interface Frontmatter {
  entity?: string;
  amp_id?: string;
  tags: string[];
}

/** Parse the leading YAML frontmatter block (a small, line-oriented subset). */
export function parseFrontmatter(md: string): Frontmatter {
  const fm: Frontmatter = { tags: [] };
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return fm;
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === 'entity') fm.entity = value;
    else if (key === 'amp_id') fm.amp_id = value;
    else if (key === 'tags') {
      const inner = value.replace(/^\[/, '').replace(/\]$/, '');
      fm.tags = inner.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return fm;
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

/** First anchor id found in a text block, or null. */
function anchorIn(block: string): string | null {
  CLAIM_ANCHOR_RE.lastIndex = 0;
  const m = CLAIM_ANCHOR_RE.exec(block);
  return m ? m[1] : null;
}

/** Remove the anchor comment and the trailing confidence annotation from a block. */
function cleanClaimText(block: string): string {
  return block
    .replace(CLAIM_ANCHOR_RE, '')
    .split('\n')
    .filter((l) => !/^\*\(confidence:[^)]*\)\*\s*$/.test(l.trim()))
    .join('\n')
    .replace(/^[-*]\s+/, '') // drop a leading markdown bullet if the user typed one
    .trim();
}

/**
 * Parse claim blocks out of an article body. Walks `## sections`, splitting each on
 * blank lines into blocks. A block counts as a claim if it carries an anchor
 * (existing claim) OR sits under a domain section with real prose (a new claim).
 */
export function parseClaimBlocks(md: string): ClaimBlock[] {
  const body = stripFrontmatter(md);
  const lines = body.split('\n');
  const blocks: ClaimBlock[] = [];

  let currentSection: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const raw = buffer.join('\n').trim();
    buffer = [];
    if (!raw) return;
    if (raw.startsWith('#')) return;          // a heading slipped through
    if (raw.startsWith('>')) return;          // blockquote (hierarchy/history)
    const anchorId = anchorIn(raw);
    const text = cleanClaimText(raw);
    if (!text) return;
    const inDomainSection = currentSection !== null && !NON_CLAIM_SECTIONS.has(currentSection);
    // Keep anchored blocks always (so corrections/removals work even if the user
    // moved them); keep anchorless blocks only under a domain section (new claims).
    if (anchorId || inDomainSection) {
      blocks.push({ anchorId, text });
    }
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      currentSection = heading[1].toLowerCase();
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();

  return blocks;
}

// ─── Reconciler ────────────────────────────────────────────────────────────────

export class WikiEditReconciler {
  private semantic: SemanticStore;
  private episodic: EpisodicStore;

  constructor(private driver: Driver) {
    this.semantic = new SemanticStore(driver);
    this.episodic = new EpisodicStore(driver);
  }

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    const { project_tag, edited_md, original_md } = input;
    const fm = parseFrontmatter(edited_md);
    const entityId = fm.amp_id ?? null;
    const sessionId = input.session_id ?? `wiki-edit-${nanoid(8)}`;

    const edited = parseClaimBlocks(edited_md);
    const editedByAnchor = new Map<string, ClaimBlock>();
    const newBlocks: ClaimBlock[] = [];
    for (const b of edited) {
      if (b.anchorId) editedByAnchor.set(b.anchorId, b);
      else newBlocks.push(b);
    }

    const result: ReconcileResult = {
      entity: fm.entity ?? null,
      entity_id: entityId,
      corrected: 0,
      added: 0,
      removed: 0,
      unchanged: 0,
      details: [],
    };

    // 1. Changed / unchanged anchored claims (compare against the live graph).
    for (const [anchorId, block] of editedByAnchor) {
      const current = await this.semantic.getById(anchorId);
      if (!current) continue; // anchor points at a node that no longer exists
      if (normalize(current.content) === normalize(block.text)) {
        result.unchanged++;
        result.details.push({ action: 'unchanged', semantic_id: anchorId, text: block.text });
        continue;
      }
      const newId = await this.applyCorrection(current, block.text, project_tag, sessionId);
      result.corrected++;
      result.details.push({ action: 'corrected', semantic_id: anchorId, new_id: newId, text: block.text });
    }

    // 2. New claims (anchorless blocks under domain sections).
    for (const block of newBlocks) {
      const newId = await this.addClaim(block.text, entityId, project_tag, fm.tags, sessionId);
      result.added++;
      result.details.push({ action: 'added', new_id: newId, text: block.text });
    }

    // 3. Removals — only when we have the pre-edit text to diff against.
    if (original_md) {
      const originalAnchors = new Set(
        parseClaimBlocks(original_md).map((b) => b.anchorId).filter((id): id is string => !!id),
      );
      for (const anchorId of originalAnchors) {
        if (editedByAnchor.has(anchorId)) continue;
        const current = await this.semantic.getById(anchorId);
        if (!current) continue;
        await this.applyRemoval(current, sessionId, project_tag);
        result.removed++;
        result.details.push({ action: 'removed', semantic_id: anchorId, text: current.content });
      }
    }

    return result;
  }

  /** Supersede an edited claim with a new human-authored node + CORRECTS signal. */
  private async applyCorrection(
    old: SemanticNode,
    newText: string,
    projectTag: string,
    sessionId: string,
  ): Promise<string> {
    const aboutEntities = await this.aboutEntityIds(old.id);
    const newNode: SemanticNode = {
      id: `sem-${nanoid(12)}`,
      content: newText,
      confidence: 0.85,
      // Neo4j integers come back as BigInt — coerce before arithmetic.
      signal_count: Number(old.signal_count ?? 0) + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      decay_class: 'stable',
      tags: mergeTags(old.tags, projectTag),
    };
    await this.semantic.supersede(old.id, newNode);
    // supersede() invalidates the old node's ABOUT edges but does not carry them
    // forward — re-link the new node so the corrected claim stays on the article.
    await this.linkAbout(newNode.id, aboutEntities);
    await this.recordSignal('correction', old.id, `Human edited claim via wiki: "${truncate(newText, 120)}"`, sessionId, projectTag);
    return newNode.id;
  }

  /** Create a brand-new human-authored claim linked to the article entity. */
  private async addClaim(
    text: string,
    entityId: string | null,
    projectTag: string,
    fmTags: string[],
    sessionId: string,
  ): Promise<string> {
    const newNode: SemanticNode = {
      id: `sem-${nanoid(12)}`,
      content: text,
      confidence: 0.8,
      signal_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      decay_class: 'stable',
      tags: mergeTags(fmTags.filter((t) => !t.startsWith('project:')), projectTag),
    };
    await this.semantic.create(newNode);
    if (entityId) await this.linkAbout(newNode.id, [entityId]);
    await this.recordEpisode(`Human added claim via wiki: "${truncate(text, 120)}"`, sessionId, projectTag);
    return newNode.id;
  }

  /** Penalise a removed claim's confidence; never delete. */
  private async applyRemoval(old: SemanticNode, sessionId: string, projectTag: string): Promise<void> {
    const penalised = Math.max(0, Number(old.confidence) - 0.3);
    await this.semantic.updateConfidence(old.id, penalised);
    await this.recordSignal('correction', old.id, `Human removed claim via wiki: "${truncate(old.content, 120)}"`, sessionId, projectTag);
  }

  // ─── Graph helpers ───────────────────────────────────────────────────────────

  private async aboutEntityIds(semanticId: string): Promise<string[]> {
    const session = this.driver.session();
    try {
      const res = await session.run(
        `MATCH (s:Semantic {id: $id})-[:ABOUT]->(e:Entity) RETURN e.id AS id`,
        { id: semanticId },
      );
      return res.records.map((r) => r.get('id') as string).filter(Boolean);
    } finally {
      await session.close();
    }
  }

  private async linkAbout(semanticId: string, entityIds: string[]): Promise<void> {
    if (entityIds.length === 0) return;
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (s:Semantic {id: $semanticId})
         UNWIND $entityIds AS eid
         MATCH (e:Entity {id: eid})
         MERGE (s)-[:ABOUT]->(e)`,
        { semanticId, entityIds },
      );
    } finally {
      await session.close();
    }
  }

  /** Create a provenance Episodic and link a signal to the target semantic. */
  private async recordSignal(
    type: 'correction' | 'contradiction' | 'reinforcement',
    targetId: string,
    detail: string,
    sessionId: string,
    projectTag: string,
  ): Promise<void> {
    const episodeId = await this.recordEpisode(detail, sessionId, projectTag);
    await this.episodic.linkSignal(episodeId, { type, target_id: targetId, detail });
  }

  private async recordEpisode(content: string, sessionId: string, projectTag: string): Promise<string> {
    return this.episodic.create({
      id: `ep-${nanoid(12)}`,
      session_id: sessionId,
      agent_id: 'human',
      task: `[${projectTag}] wiki edit`,
      content: `[${projectTag}] ${content}`,
      created_at: new Date().toISOString(),
      tags: [projectTag, 'human-authored', 'wiki-edit'],
    });
  }
}

// ─── Small utilities ───────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function mergeTags(existing: string[], projectTag: string): string[] {
  const set = new Set(existing ?? []);
  set.add(projectTag);
  set.add('human-authored');
  return [...set];
}

// keep the neo4j import referenced for environments that tree-shake type-only imports
void neo4j;
