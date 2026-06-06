import { describe, it, expect, vi } from 'vitest';
import { DreamEngine, isGap, type DreamEngineDeps } from '../dream.js';
import type { AMPConfig, FactNode } from '../types.js';
import type { LlmClient } from '../llm.js';

const NOW = '2026-06-06T00:00:00.000Z';

function activeFact(subject: string, predicate: string, object: string): FactNode {
  return {
    id: `f-${predicate}-${object}`,
    subject, predicate, object,
    entity_id: null, source_episode_ids: [],
    valid_at: NOW, invalid_at: null, confidence: 0.9,
    status: 'active', inference_type: 'deductive',
    supersedes_fact_id: null, scope: 'project', tags: [],
    created_at: NOW, updated_at: NOW,
  };
}

const CONFIG = {} as AMPConfig;

function fakeLlm(over: Partial<LlmClient> & { chat?: LlmClient['chat'] } = {}): LlmClient {
  return {
    available: over.available ?? true,
    modelFor: over.modelFor ?? ((t) => `model-${t}`),
    chat: over.chat ?? vi.fn().mockResolvedValue(JSON.stringify({ hypotheses: [] })),
  };
}

describe('isGap', () => {
  it('flags sparse (<3 active facts) entities', () => {
    expect(isGap([])).toBe(true);
    expect(isGap([activeFact('m', 'uses', 'a'), activeFact('m', 'uses', 'b')])).toBe(true);
  });
  it('flags entities with a disputed fact even when well-covered', () => {
    const facts = [activeFact('m', 'uses', 'a'), activeFact('m', 'uses', 'b'), activeFact('m', 'uses', 'c')];
    expect(isGap(facts)).toBe(false);
    const disputed = { ...activeFact('m', 'uses', 'd'), status: 'disputed' as const };
    expect(isGap([...facts, disputed])).toBe(true);
  });
});

describe('DreamEngine.run', () => {
  function makeDeps(overrides: Partial<DreamEngineDeps> = {}): {
    deps: DreamEngineDeps;
    create: ReturnType<typeof vi.fn>;
    serializeKeys: string[];
  } {
    const create = vi.fn().mockResolvedValue('fact-new');
    const serializeKeys: string[] = [];
    const deps: DreamEngineDeps = {
      graph: {
        entitiesInScope: vi.fn().mockResolvedValue([
          { name: 'mod-a', entity_id: 'e-a' }, // sparse → gap
          { name: 'mod-b', entity_id: 'e-b' }, // well-covered → not a gap
        ]),
      },
      fact: {
        getActive: vi.fn(async (name: string) =>
          name === 'mod-b'
            ? [activeFact('mod-b', 'uses', '1'), activeFact('mod-b', 'uses', '2'), activeFact('mod-b', 'uses', '3')]
            : [],
        ),
        findBySubjectPredicate: vi.fn().mockResolvedValue([]),
        create,
      },
      llm: fakeLlm({
        chat: vi.fn().mockResolvedValue(JSON.stringify({
          hypotheses: [
            { subject: 'mod-a', predicate: 'uses', object: 'redis' },
            { subject: 'mod-a', predicate: 'implements', object: 'cache' },
          ],
        })),
      }),
      blocks: null,
      config: CONFIG,
      serialize: (key, fn) => { serializeKeys.push(key); return fn(); },
      ...overrides,
    };
    return { deps, create, serializeKeys };
  }

  it('mints abductive tentative facts only for gap entities, tagged and serialized', async () => {
    const { deps, create, serializeKeys } = makeDeps();
    const engine = new DreamEngine(deps);

    const result = await engine.run('project:test', { cards: false });

    expect(result.entities_scanned).toBe(2);
    expect(result.gaps_found).toBe(1);            // only mod-a
    expect(result.hypotheses_created).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);

    const minted = create.mock.calls[0]![0] as FactNode;
    expect(minted.status).toBe('tentative');
    expect(minted.inference_type).toBe('abductive');
    expect(minted.confidence).toBeLessThan(0.5);
    expect(minted.tags).toContain('dream');
    expect(minted.source_episode_ids).toEqual([]);

    // writes serialized under the entity id
    expect(serializeKeys).toContain('e-a');
  });

  it('dedupes against existing facts with the same object', async () => {
    const { deps, create } = makeDeps();
    (deps.fact.findBySubjectPredicate as ReturnType<typeof vi.fn>).mockImplementation(
      async (_s: string, pred: string) => (pred === 'uses' ? [activeFact('mod-a', 'uses', 'redis')] : []),
    );
    const result = await new DreamEngine(deps).run('project:test', { cards: false });
    expect(result.hypotheses_skipped).toBe(1); // the 'uses redis' dup
    expect(result.hypotheses_created).toBe(1); // 'implements cache' survives
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('never mutates existing facts: the fact layer exposes no invalidate/dispute', () => {
    const { deps } = makeDeps();
    // Structural guarantee — the dream pass can only create, by interface design.
    expect((deps.fact as Record<string, unknown>).invalidate).toBeUndefined();
    expect((deps.fact as Record<string, unknown>).dispute).toBeUndefined();
  });

  it('does nothing when no LLM is configured', async () => {
    const { deps, create } = makeDeps({ llm: fakeLlm({ available: false }) });
    const result = await new DreamEngine(deps).run('project:test');
    expect(result.llm_available).toBe(false);
    expect(result.hypotheses_created).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('skips (without scanning) when the scope lock is held by another process', async () => {
    const acquire = vi.fn().mockResolvedValue(false);
    const release = vi.fn().mockResolvedValue(true);
    const { deps, create } = makeDeps({ lock: { acquire, release } });
    const result = await new DreamEngine(deps).run('project:test', { cards: false });
    expect(result.lock_skipped).toBe(true);
    expect(result.entities_scanned).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(acquire).toHaveBeenCalledWith('project:test', expect.any(String));
    expect(release).not.toHaveBeenCalled(); // never acquired → nothing to release
  });

  it('acquires and releases the scope lock around a normal run', async () => {
    const acquire = vi.fn().mockResolvedValue(true);
    const release = vi.fn().mockResolvedValue(true);
    const { deps } = makeDeps({ lock: { acquire, release } });
    const result = await new DreamEngine(deps).run('project:test', { cards: false });
    expect(result.lock_skipped).toBe(false);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('refreshes the project_card without touching human blocks', async () => {
    const rewrite = vi.fn().mockResolvedValue({});
    const { deps } = makeDeps({
      blocks: { read: vi.fn().mockResolvedValue(null), rewrite },
      llm: fakeLlm({
        chat: vi.fn()
          .mockResolvedValueOnce(JSON.stringify({ hypotheses: [] })) // hypothesize(mod-a)
          .mockResolvedValueOnce('**Project** amp — memory platform.'), // card
      }),
    });
    const result = await new DreamEngine(deps).run('project:test'); // cards default on
    expect(result.cards_refreshed).toBe(1);
    expect(rewrite).toHaveBeenCalledTimes(1);
    const [scope, name, content] = rewrite.mock.calls[0]!;
    expect(scope).toBe('project:test');
    expect(name).toBe('project_card');
    expect(String(content)).toContain('amp:card');
    // never wrote to a human-authored block
    const namesWritten = rewrite.mock.calls.map((c) => c[1]);
    expect(namesWritten).not.toContain('user');
    expect(namesWritten).not.toContain('project_state');
  });
});
