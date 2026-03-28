// packages/mcp/src/__tests__/tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildToolHandlers,
  setServiceInstances,
  type IAMPService,
  type IConsolidationEngine,
  type IScopedQuery,
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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setServiceInstances({
    ampService: mockAmpService,
    consolidationEngine: mockConsolidationEngine,
    scopedQuery: mockScopedQuery,
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
    });
    const handlers = buildToolHandlers();
    await expect(handlers.amp_consolidate({ action: 'status' })).rejects.toThrow(
      'ConsolidationEngine not initialised',
    );
  });
});
