// packages/mcp/src/__tests__/tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildToolHandlers,
  setServiceInstances,
  type IAMPService,
  type IConsolidationEngine,
  type IScopedQuery,
  type IMemoryBlockService,
} from '../tools.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAmpService: IAMPService = {
  load: vi.fn().mockResolvedValue({
    markdown: '# Memory Context\n\ntest content',
    tokens: 42,
    sources: ['id-1'],
    assembled_at: '2026-01-01T00:00:00.000Z',
  }),
  store: vi.fn().mockResolvedValue({ id: 'ep-abc123', duplicate: false }),
};

const mockConsolidationEngine: IConsolidationEngine = {
  run: vi.fn().mockResolvedValue({ proposalCount: 3 }),
  status: vi.fn().mockResolvedValue({ pending: 5, lastRun: '2026-01-01T00:00:00.000Z' }),
  review: vi.fn().mockResolvedValue({ id: 'prop-1', type: 'promote', score: 0.9 }),
  apply: vi.fn().mockResolvedValue({ applied: true }),
};

const mockScopedQuery: IScopedQuery = {
  rawCypher: vi.fn().mockResolvedValue([{ n: { id: 'sem-1', content: 'test' } }]),
};

const mockMemoryBlockService: IMemoryBlockService = {
  read: vi.fn().mockResolvedValue({
    id: 'block-1',
    name: 'persona',
    tier: 'core',
    content: 'You are a helpful assistant.',
    scope: 'project:test',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }),
  insert: vi.fn().mockResolvedValue({
    id: 'block-1', name: 'persona', tier: 'core',
    content: 'You are a helpful assistant. And wise.',
    scope: 'project:test',
  }),
  replace: vi.fn().mockResolvedValue({
    id: 'block-1', name: 'persona', tier: 'core',
    content: 'You are a wise assistant.',
    scope: 'project:test',
  }),
  rewrite: vi.fn().mockResolvedValue({
    id: 'block-1', name: 'persona', tier: 'core',
    content: 'Completely new persona.',
    scope: 'project:test',
  }),
  promote: vi.fn().mockResolvedValue({
    id: 'block-1', name: 'working_state', tier: 'core',
    content: 'promoted content',
    scope: 'project:test',
  }),
  archive: vi.fn().mockResolvedValue('archived block content'),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

const mockBootstrapService = {
  bootstrap: vi.fn().mockResolvedValue({
    entities_created: 1, entities_existing: 0,
    agents_created: 1, agents_existing: 0,
    semantics_created: 0, relationships_created: 0,
    project_entity_id: 'test-id',
  }),
  isBootstrapped: vi.fn().mockResolvedValue(false),
  status: vi.fn().mockResolvedValue({ bootstrapped: false }),
};

beforeEach(() => {
  vi.clearAllMocks();
  setServiceInstances({
    ampService: mockAmpService,
    consolidationEngine: mockConsolidationEngine,
    scopedQuery: mockScopedQuery,
    bootstrapService: mockBootstrapService,
    memoryBlockService: mockMemoryBlockService,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('amp_load handler', () => {
  it('calls AMPService.load with correct scope and returns markdown', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_load({
      task: 'Write brand copy',
      entities: ['ClientX'],
      tags: ['brand-voice'],
      max_tokens: 2000,
    });

    expect(mockAmpService.load).toHaveBeenCalledWith({
      task: 'Write brand copy',
      entities: ['ClientX'],
      tags: ['brand-voice'],
      max_tokens: 2000,
    });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('# Memory Context');
  });

  it('uses default max_tokens when not provided', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_load({ task: 'test task' });

    expect(mockAmpService.load).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4000 }),
    );
  });

  it('throws when AMPService is not initialised', async () => {
    // Reset service instances
    setServiceInstances({
      ampService: null as unknown as IAMPService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: mockScopedQuery,
    bootstrapService: mockBootstrapService,
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_load({ task: 'test' })).rejects.toThrow('AMPService not initialised');
  });
});

describe('amp_store handler', () => {
  it('calls AMPService.store and returns id', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_store({
      session_id: 'sess-1',
      task: 'Write copy',
      content: 'Some content here',
      outcome: 'approved',
    });

    expect(mockAmpService.store).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'sess-1',
        task: 'Write copy',
        content: 'Some content here',
        outcome: 'approved',
        agent_id: 'mcp',
      }),
    );
    expect(result.content[0].text).toContain('id:ep-abc123');
  });

  it('returns duplicate:true when store reports duplicate', async () => {
    vi.mocked(mockAmpService.store).mockResolvedValueOnce({ id: '', duplicate: true });
    const handlers = buildToolHandlers();
    const result = await handlers.amp_store({
      session_id: 'sess-1',
      task: 'test',
      content: 'duplicate content',
    });
    expect(result.content[0].text).toBe('duplicate:true');
  });

  it('passes signals to AMPService.store', async () => {
    const handlers = buildToolHandlers();
    const signals = [
      { type: 'reinforcement' as const, target_id: 'sem-1', detail: 'good tone' },
    ];
    await handlers.amp_store({
      session_id: 'sess-2',
      task: 'review',
      content: 'content',
      signals,
    });

    expect(mockAmpService.store).toHaveBeenCalledWith(
      expect.objectContaining({ signals }),
    );
  });
});

describe('amp_query handler', () => {
  it('calls rawCypher with query and limit', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_query({
      query: 'MATCH (n:Semantic) RETURN n',
      limit: 5,
    });

    expect(mockScopedQuery.rawCypher).toHaveBeenCalledWith(
      'MATCH (n:Semantic) RETURN n',
      5,
    );
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('uses default limit of 10 when not provided', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_query({ query: 'MATCH (n) RETURN n' });
    expect(mockScopedQuery.rawCypher).toHaveBeenCalledWith(expect.any(String), 10);
  });

  it('throws when ScopedQuery is not initialised', async () => {
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: null as unknown as IScopedQuery,
      bootstrapService: mockBootstrapService,
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_query({ query: 'MATCH (n) RETURN n' })).rejects.toThrow(
      'ScopedQuery not initialised',
    );
  });
});

describe('amp_resolve handler', () => {
  it('resolves entity URI correctly (calls load with entities scope)', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_resolve({ uri: 'amp://entity/ClientX' });

    expect(mockAmpService.load).toHaveBeenCalledWith(
      expect.objectContaining({
        entities: ['ClientX'],
        max_tokens: 2000,
      }),
    );
    const callArgs = vi.mocked(mockAmpService.load).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('tags');
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('# Memory Context');
  });

  it('resolves tag URI correctly (calls load with tags scope)', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_resolve({ uri: 'amp://tag/brand-voice' });

    expect(mockAmpService.load).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['brand-voice'],
        max_tokens: 2000,
      }),
    );
    const callArgs = vi.mocked(mockAmpService.load).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('entities');
  });

  it('uses stage_context as the task parameter', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_resolve({
      uri: 'amp://entity/ClientX',
      stage_context: 'Writing brand copy for ClientX landing page',
    });

    expect(mockAmpService.load).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Writing brand copy for ClientX landing page',
      }),
    );
  });

  it('synthesizes a default task when stage_context is omitted', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_resolve({ uri: 'amp://entity/ClientX' });

    expect(mockAmpService.load).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Resolve amp://entity/ClientX',
      }),
    );
  });

  it('throws on invalid URI', async () => {
    const handlers = buildToolHandlers();
    await expect(handlers.amp_resolve({ uri: 'not-an-amp-uri' })).rejects.toThrow(
      'Invalid AMP URI',
    );
  });

  it('throws when AMPService is not initialised', async () => {
    setServiceInstances({
      ampService: null as unknown as IAMPService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: mockScopedQuery,
    bootstrapService: mockBootstrapService,
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_resolve({ uri: 'amp://entity/ClientX' })).rejects.toThrow(
      'AMPService not initialised',
    );
  });
});

describe('amp_consolidate handler', () => {
  it('calls run action correctly', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_consolidate({ action: 'run', scope: 'ClientX' });

    expect(mockConsolidationEngine.run).toHaveBeenCalledWith('ClientX');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.proposalCount).toBe(3);
  });

  it('calls run without scope — defaults to global', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_consolidate({ action: 'run' });
    expect(mockConsolidationEngine.run).toHaveBeenCalledWith('global');
  });

  it('calls status action correctly', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_consolidate({ action: 'status' });

    expect(mockConsolidationEngine.status).toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pending).toBe(5);
  });

  it('calls review action to fetch a proposal', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_consolidate({
      action: 'review',
      proposal_id: 'prop-1',
    });

    expect(mockConsolidationEngine.review).toHaveBeenCalledWith('prop-1');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('prop-1');
  });

  it('calls review action with decision to apply', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_consolidate({
      action: 'review',
      proposal_id: 'prop-1',
      decision: 'approve',
    });

    expect(mockConsolidationEngine.apply).toHaveBeenCalledWith('prop-1', 'approve');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.applied).toBe(true);
  });

  it('throws when review action is missing proposal_id', async () => {
    const handlers = buildToolHandlers();
    await expect(
      handlers.amp_consolidate({ action: 'review' }),
    ).rejects.toThrow('"proposal_id" is required');
  });

  it('throws when ConsolidationEngine is not initialised', async () => {
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: null as unknown as IConsolidationEngine,
      scopedQuery: mockScopedQuery,
      bootstrapService: mockBootstrapService,
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_consolidate({ action: 'status' })).rejects.toThrow(
      'ConsolidationEngine not initialised',
    );
  });
});

// ─── Memory block tools ────────────────────────────────────────────────────

describe('amp_memory_read handler', () => {
  it('reads a block and returns JSON', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_read({ block: 'persona', scope: 'project:test' });
    expect(mockMemoryBlockService.read).toHaveBeenCalledWith('project:test', 'persona', undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe('persona');
    expect(parsed.content).toBe('You are a helpful assistant.');
  });

  it('returns found:false when block does not exist', async () => {
    vi.mocked(mockMemoryBlockService.read).mockResolvedValueOnce(null);
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_read({ block: 'nonexistent' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.found).toBe(false);
  });

  it('uses default scope when not provided', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_memory_read({ block: 'persona' });
    expect(mockMemoryBlockService.read).toHaveBeenCalledWith('default', 'persona', undefined);
  });

  it('passes session_id for working blocks', async () => {
    const handlers = buildToolHandlers();
    await handlers.amp_memory_read({ block: 'working_state', scope: 'project:test', session_id: 'sess-1' });
    expect(mockMemoryBlockService.read).toHaveBeenCalledWith('project:test', 'working_state', 'sess-1');
  });
});

describe('amp_memory_insert handler', () => {
  it('inserts text and returns result', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_insert({
      block: 'persona',
      text: ' And wise.',
      scope: 'project:test',
    });
    expect(mockMemoryBlockService.insert).toHaveBeenCalledWith('project:test', 'persona', ' And wise.', undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.block).toBe('persona');
  });
});

describe('amp_memory_replace handler', () => {
  it('replaces text and returns result', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_replace({
      block: 'persona',
      old_text: 'helpful',
      new_text: 'wise',
      scope: 'project:test',
    });
    expect(mockMemoryBlockService.replace).toHaveBeenCalledWith('project:test', 'persona', 'helpful', 'wise', undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });
});

describe('amp_memory_rewrite handler', () => {
  it('rewrites block and returns result', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_rewrite({
      block: 'persona',
      content: 'Completely new persona.',
      scope: 'project:test',
    });
    expect(mockMemoryBlockService.rewrite).toHaveBeenCalledWith('project:test', 'persona', 'Completely new persona.', undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.block).toBe('persona');
  });
});

describe('amp_memory_promote handler', () => {
  it('promotes block tier and returns result', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_promote({
      block: 'working_state',
      from_tier: 'working',
      to_tier: 'core',
      scope: 'project:test',
    });
    expect(mockMemoryBlockService.promote).toHaveBeenCalledWith('project:test', 'working_state', 'working', 'core', undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.tier).toBe('core');
  });
});

describe('amp_memory_archive handler', () => {
  it('archives block and returns content length', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_memory_archive({
      block: 'persona',
      scope: 'project:test',
    });
    expect(mockMemoryBlockService.archive).toHaveBeenCalledWith('project:test', 'persona', undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.archived_length).toBe('archived block content'.length);
  });
});

describe('memory block tools throw when service not initialised', () => {
  it('amp_memory_read throws', async () => {
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: mockScopedQuery,
      bootstrapService: mockBootstrapService,
      // memoryBlockService omitted
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_memory_read({ block: 'persona' })).rejects.toThrow('MemoryBlockService not initialised');
  });
});

// ─── amp_grep tests ─────────────────────────────────────────────────────────

describe('amp_grep handler', () => {
  it('performs exact string match across node types and returns markdown', async () => {
    // Mock rawCypher to return results for different node types
    const mockResults = {
      episodic: [{ e: { id: 'ep-1', content: 'We decided to use JWT tokens for auth', task: '[project:amp] refactor auth', created_at: '2026-04-05T00:00:00Z' } }],
      semantic: [{ s: { id: 'sem-1', content: 'Auth module uses JWT for stateless authentication', confidence: 0.85 } }],
      fact: [{ f: { id: 'fact-1', subject: 'auth-module', predicate: 'uses', object: 'JWT', status: 'active', valid_at: '2026-03-15', updated_at: '2026-04-01' } }],
      block: [{ b: { scope: 'project:amp', name: 'project_state', content: 'current auth uses JWT tokens', tier: 'core', updated_at: '2026-04-01' } }],
      entity: [{ ent: { id: 'ent-1', name: 'JWT', description: 'JSON Web Token standard', type: 'concept' } }],
    };

    let callIndex = 0;
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      if (cypher.includes('Episodic')) return mockResults.episodic;
      if (cypher.includes('Semantic')) return mockResults.semantic;
      if (cypher.includes('Fact')) return mockResults.fact;
      if (cypher.includes('MemoryBlock')) return mockResults.block;
      if (cypher.includes('Entity')) return mockResults.entity;
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT' });

    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('## Grep Results: "JWT"');
    expect(text).toContain('5 matches');
    expect(text).toContain('### Entities');
    expect(text).toContain('### Semantic');
    expect(text).toContain('### Facts');
    expect(text).toContain('### Episodic');
    expect(text).toContain('### Blocks');
    expect(text).toContain('**JWT**');
  });

  it('supports regex matching', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      // Check that the regex pattern is used in the query
      if (cypher.includes('=~') && cypher.includes('Semantic')) {
        return [{ s: { id: 'sem-1', content: 'Uses JWT or OAuth2 for auth', confidence: 0.7 } }];
      }
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT|OAuth2', regex: true });

    const text = result.content[0].text;
    expect(text).toContain('## Grep Results: "JWT|OAuth2"');
    expect(text).toContain('1 match');
  });

  it('returns error for invalid regex', async () => {
    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: '[invalid', regex: true });

    const text = result.content[0].text;
    expect(text).toContain('**Error:**');
    expect(text).toContain('Invalid regular expression');
  });

  it('supports case-sensitive matching', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      // Case-sensitive should use CONTAINS directly without toLower
      if (cypher.includes('Semantic') && cypher.includes("CONTAINS 'JWT'") && !cypher.includes('toLower')) {
        return [{ s: { id: 'sem-1', content: 'Uses JWT tokens', confidence: 0.9 } }];
      }
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT', case_sensitive: true });

    const text = result.content[0].text;
    expect(text).toContain('1 match');
  });

  it('filters by node type', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      if (cypher.includes('Semantic')) {
        return [{ s: { id: 'sem-1', content: 'Uses JWT tokens', confidence: 0.9 } }];
      }
      // Should not be called for other types
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT', node_types: ['semantic'] });

    const text = result.content[0].text;
    expect(text).toContain('1 match');
    expect(text).toContain('### Semantic');
    expect(text).not.toContain('### Episodic');
    expect(text).not.toContain('### Facts');
    // Verify rawCypher was only called once (for semantic)
    expect(mockScopedQuery.rawCypher).toHaveBeenCalledTimes(1);
  });

  it('filters by scope', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      // Episodic scope filter via task CONTAINS
      if (cypher.includes('Episodic') && cypher.includes("task CONTAINS 'project:amp'")) {
        return [{ e: { id: 'ep-1', content: 'JWT auth decision', task: '[project:amp] auth', created_at: '2026-04-05' } }];
      }
      // Semantic scope filter via tags
      if (cypher.includes('Semantic') && cypher.includes("'project:amp' IN s.tags")) {
        return [{ s: { id: 'sem-1', content: 'JWT pattern used', confidence: 0.8 } }];
      }
      // Fact scope filter via f.scope
      if (cypher.includes('Fact') && cypher.includes("f.scope = 'project:amp'")) {
        return [];
      }
      // Block scope filter via b.scope
      if (cypher.includes('MemoryBlock') && cypher.includes("b.scope = 'project:amp'")) {
        return [];
      }
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT', scope: 'project:amp' });

    const text = result.content[0].text;
    expect(text).toContain('2 matches');
  });

  it('generates snippets with bold matches and context', async () => {
    const longContent = 'A'.repeat(150) + 'JWT' + 'B'.repeat(150);
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      if (cypher.includes('Semantic')) {
        return [{ s: { id: 'sem-1', content: longContent, confidence: 0.5 } }];
      }
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT', node_types: ['semantic'] });

    const text = result.content[0].text;
    // Should have ellipsis for truncation and bold match
    expect(text).toContain('...');
    expect(text).toContain('**JWT**');
  });

  it('returns empty results message when nothing matches', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockResolvedValue([]);

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'nonexistent_pattern_xyz' });

    const text = result.content[0].text;
    expect(text).toContain('0 matches');
    expect(text).toContain('_No matches found._');
  });

  it('deduplicates results by ID', async () => {
    // Return the same entity from multiple queries — should appear only once
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      if (cypher.includes('Entity')) {
        return [
          { ent: { id: 'ent-1', name: 'JWT', description: 'JSON Web Token', type: 'concept' } },
          { ent: { id: 'ent-1', name: 'JWT', description: 'JSON Web Token', type: 'concept' } },
        ];
      }
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT', node_types: ['entity'] });

    const text = result.content[0].text;
    expect(text).toContain('1 match');
  });

  it('throws when ScopedQuery is not initialised', async () => {
    setServiceInstances({
      ampService: mockAmpService,
      consolidationEngine: mockConsolidationEngine,
      scopedQuery: null as unknown as IScopedQuery,
      bootstrapService: mockBootstrapService,
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_grep({ pattern: 'test' })).rejects.toThrow('ScopedQuery not initialised');
  });

  it('handles query failures gracefully per node type', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      if (cypher.includes('Episodic')) throw new Error('DB error');
      if (cypher.includes('Semantic')) {
        return [{ s: { id: 'sem-1', content: 'test pattern match', confidence: 0.5 } }];
      }
      if (cypher.includes('Fact')) throw new Error('DB error');
      if (cypher.includes('MemoryBlock')) throw new Error('DB error');
      if (cypher.includes('Entity')) throw new Error('DB error');
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'test' });

    // Should still return results from semantic even though others failed
    const text = result.content[0].text;
    expect(text).toContain('1 match');
    expect(text).toContain('### Semantic');
  });

  it('respects limit parameter', async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) => ({
      s: { id: `sem-${i}`, content: `JWT usage pattern ${i}`, confidence: 0.5 },
    }));
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      if (cypher.includes('Semantic')) return manyResults;
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: 'JWT', node_types: ['semantic'], limit: 3 });

    const text = result.content[0].text;
    expect(text).toContain('3 matches');
  });

  it('escapes special characters in pattern for exact match', async () => {
    vi.mocked(mockScopedQuery.rawCypher).mockImplementation(async (cypher: string) => {
      // The pattern should be escaped — single quotes escaped
      if (cypher.includes('Semantic') && cypher.includes("it\\'s")) {
        return [{ s: { id: 'sem-1', content: "it's a test", confidence: 0.5 } }];
      }
      return [];
    });

    const handlers = buildToolHandlers();
    const result = await handlers.amp_grep({ pattern: "it's", node_types: ['semantic'] });

    const text = result.content[0].text;
    expect(text).toContain('1 match');
  });
});
