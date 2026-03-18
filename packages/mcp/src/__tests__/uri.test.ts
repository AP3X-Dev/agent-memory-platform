// packages/mcp/src/__tests__/uri.test.ts
import { describe, it, expect } from 'vitest';
import { parseAmpUri, uriToLoadScope } from '../uri.js';

describe('parseAmpUri', () => {
  it('parses entity URIs', () => {
    const result = parseAmpUri('amp://entity/ClientX');
    expect(result).toEqual({ type: 'entity', name: 'ClientX' });
  });

  it('parses tag URIs', () => {
    const result = parseAmpUri('amp://tag/brand-voice');
    expect(result).toEqual({ type: 'tag', name: 'brand-voice' });
  });

  it('parses entity names with spaces preserved', () => {
    const result = parseAmpUri('amp://entity/Acme Corp');
    expect(result).toEqual({ type: 'entity', name: 'Acme Corp' });
  });

  it('throws on URIs without amp:// prefix', () => {
    expect(() => parseAmpUri('http://entity/ClientX')).toThrow(/must start with/);
  });

  it('throws on URIs with unknown type', () => {
    expect(() => parseAmpUri('amp://unknown/ClientX')).toThrow(/unknown type/);
  });

  it('throws on URIs without type/name separator', () => {
    expect(() => parseAmpUri('amp://entityonly')).toThrow(/separator/);
  });

  it('throws on URIs with empty name', () => {
    expect(() => parseAmpUri('amp://entity/')).toThrow(/name is empty/);
  });

  it('throws on empty string', () => {
    expect(() => parseAmpUri('')).toThrow();
  });
});

describe('uriToLoadScope', () => {
  it('converts entity URI to entities array', () => {
    const uri = { type: 'entity' as const, name: 'ClientX' };
    const scope = uriToLoadScope(uri);
    expect(scope).toEqual({ entities: ['ClientX'] });
  });

  it('converts tag URI to tags array', () => {
    const uri = { type: 'tag' as const, name: 'brand-voice' };
    const scope = uriToLoadScope(uri);
    expect(scope).toEqual({ tags: ['brand-voice'] });
  });

  it('does not include tags field for entity URIs', () => {
    const uri = { type: 'entity' as const, name: 'X' };
    const scope = uriToLoadScope(uri);
    expect(scope.tags).toBeUndefined();
  });

  it('does not include entities field for tag URIs', () => {
    const uri = { type: 'tag' as const, name: 'style' };
    const scope = uriToLoadScope(uri);
    expect(scope.entities).toBeUndefined();
  });
});
