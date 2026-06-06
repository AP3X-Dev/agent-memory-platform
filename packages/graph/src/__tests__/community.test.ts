import { describe, it, expect } from 'vitest';
import { detectCommunities } from '../community.js';
import type { AmpGraphEdge, AmpGraphNode, AmpGraphSnapshot } from '../types.js';

function n(id: string, label = id): AmpGraphNode {
  return { id, type: 'entity', label, properties: {} };
}
function e(source: string, target: string, weight = 1): AmpGraphEdge {
  return { id: `${source}|${target}`, source, target, relation: 'USES', weight, properties: {} };
}

/** Two cliques joined by a single bridge edge. */
function twoClusters(): AmpGraphSnapshot {
  return {
    generated_at: 't',
    truncated: false,
    total_available: 6,
    nodes: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((id) => n(id)),
    edges: [
      e('a1', 'a2'), e('a2', 'a3'), e('a1', 'a3'),
      e('b1', 'b2'), e('b2', 'b3'), e('b1', 'b3'),
      e('a1', 'b1'), // single bridge
    ],
  };
}

describe('detectCommunities', () => {
  it('separates two cliques into two communities', () => {
    const res = detectCommunities(twoClusters());
    expect(res.count).toBe(2);
    const groups = res.communities
      .filter((c) => c.size >= 2)
      .map((c) => c.members.join(','))
      .sort();
    expect(groups).toEqual(['a1,a2,a3', 'b1,b2,b3']);
  });

  it('is deterministic across runs', () => {
    const g = twoClusters();
    const a = detectCommunities(g);
    const b = detectCommunities(g);
    expect([...a.membership.entries()].sort()).toEqual([...b.membership.entries()].sort());
    expect(a.communities.map((c) => c.id)).toEqual(b.communities.map((c) => c.id));
  });

  it('computes cohesion and a human-readable theme label', () => {
    const res = detectCommunities(twoClusters());
    const c = res.communities.find((x) => x.members.includes('a1'))!;
    expect(c.size).toBe(3);
    expect(c.internal_edges).toBe(3); // triangle
    expect(c.cohesion).toBe(1); // 3 of 3 possible
    expect(c.sample.length).toBeGreaterThan(0);
    expect(typeof c.label).toBe('string');
  });

  it('assigns canonical, stable ids (size desc, then representative)', () => {
    const g: AmpGraphSnapshot = {
      generated_at: 't',
      truncated: false,
      total_available: 5,
      nodes: ['x1', 'x2', 'x3', 'y1', 'y2'].map((id) => n(id)),
      edges: [e('x1', 'x2'), e('x2', 'x3'), e('x1', 'x3'), e('y1', 'y2')],
    };
    const res = detectCommunities(g);
    // Larger cluster (x*) gets id 0.
    expect(res.communities[0].members).toEqual(['x1', 'x2', 'x3']);
    expect(res.communities[0].id).toBe(0);
  });

  it('leaves isolated nodes as singletons that do not count as areas', () => {
    const g: AmpGraphSnapshot = {
      generated_at: 't',
      truncated: false,
      total_available: 4,
      nodes: ['a1', 'a2', 'lonely', 'lonely2'].map((id) => n(id)),
      edges: [e('a1', 'a2')],
    };
    const res = detectCommunities(g);
    expect(res.count).toBe(1); // only {a1,a2}
    expect(res.membership.get('lonely')).not.toBe(res.membership.get('a1'));
  });

  it('handles an empty graph', () => {
    const res = detectCommunities({ generated_at: 't', truncated: false, total_available: 0, nodes: [], edges: [] });
    expect(res.communities).toEqual([]);
    expect(res.count).toBe(0);
  });
});
