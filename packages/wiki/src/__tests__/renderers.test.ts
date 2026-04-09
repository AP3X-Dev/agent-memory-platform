// packages/wiki/src/__tests__/renderers.test.ts
// Tests for pure rendering functions in renderers.ts.

import { describe, it, expect } from 'vitest';
import {
  renderFrontmatter,
  renderEntityArticle,
  renderProjectIndex,
  renderDecisionsPage,
  renderPatternsPage,
  renderRecentChanges,
  renderProjectGraph,
  renderLibraryIndex,
  renderLibraryPage,
  renderTopicIndex,
  renderTopicPage,
  renderPortalHomepage,
} from '../renderers.js';
import type { ProjectData, PortalData, TopicData, LibraryPage, SourceInfo, EpisodicEntry } from '../types.js';

// Frontmatter

describe('renderFrontmatter', () => {
  it('renders key-value pairs in YAML format', () => {
    const result = renderFrontmatter({ title: 'Test', count: 42 });
    expect(result).toContain('---');
    expect(result).toContain('title: Test');
    expect(result).toContain('count: 42');
  });

  it('renders arrays as inline lists', () => {
    const result = renderFrontmatter({ tags: ['a', 'b', 'c'] });
    expect(result).toContain('tags: [a, b, c]');
  });

  it('omits null, undefined, and empty arrays', () => {
    const result = renderFrontmatter({
      present: 'yes',
      missing: null,
      undef: undefined,
      empty: [],
    });
    expect(result).toContain('present: yes');
    expect(result).not.toContain('missing');
    expect(result).not.toContain('undef');
    expect(result).not.toContain('empty');
  });
});

// Entity article

describe('renderEntityArticle', () => {
  const baseArticle = {
    entity: {
      id: 'ent-1',
      name: 'TestWidget',
      type: 'component',
      slug: 'test-widget',
      description: 'A test widget component',
      created_at: '2026-01-01',
    },
    frontmatter: {
      entity: 'test-widget',
      type: 'component',
      confidence: 0.85,
      sources: 2,
      inbound_links: 3,
      last_compiled: '2026-04-09',
      amp_id: 'ent-1',
      aliases: [],
      tags: ['architecture'],
      parent: 'ParentSystem',
      children: ['ChildA', 'ChildB'],
    },
    sections: [
      {
        heading: 'Architecture',
        claims: [
          {
            content: 'TestWidget uses a reactive pattern',
            confidence: 0.9,
            amp_id: 'sem-1',
            source_refs: [],
            entity_refs: [],
          },
        ],
      },
    ],
    backlinks: [
      { entity_name: 'OtherEntity', context: 'mentioned in context' },
    ],
    see_also: [
      { entity_name: 'RelatedEntity', context: 'via USES' },
    ],
    sources: [
      { title: 'Design Doc', source_type: 'article', slug: 'design-doc' },
    ],
    hierarchy: { parent: 'ParentSystem', children: ['ChildA', 'ChildB'] },
    projectSlug: 'test-project',
  };

  it('renders entity name as H1', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('# TestWidget');
  });

  it('renders description', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('A test widget component');
  });

  it('renders hierarchy links', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('Part of:');
    expect(result).toContain('ParentSystem');
    expect(result).toContain('Contains:');
  });

  it('renders claim sections with confidence', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('## Architecture');
    expect(result).toContain('TestWidget uses a reactive pattern');
    expect(result).toContain('0.90');
  });

  it('renders high-confidence claims in Key Decisions', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('## Key Decisions');
    expect(result).toContain('reactive pattern');
  });

  it('renders backlinks section', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('## Referenced By');
    expect(result).toContain('OtherEntity');
  });

  it('renders see also section', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('## See Also');
    expect(result).toContain('RelatedEntity');
  });

  it('renders sources section', () => {
    const result = renderEntityArticle(baseArticle, []);
    expect(result).toContain('## Sources');
    expect(result).toContain('Design Doc');
  });

  it('renders episodic history when provided', () => {
    const episodics: EpisodicEntry[] = [
      {
        id: 'ep-1',
        task: '[project:test] Fixed widget rendering',
        content: '[project:test] Applied reactive pattern fix to widget',
        outcome: 'approved',
        session_id: 'sess-1',
        created_at: '2026-04-09T10:00:00Z',
        project_scope: 'test',
      },
    ];
    const result = renderEntityArticle(baseArticle, episodics);
    expect(result).toContain('## History');
    expect(result).toContain('2026-04-09');
    expect(result).toContain('[APPROVED]');
    expect(result).toContain('Fixed widget rendering');
  });
});

// Project index

describe('renderProjectIndex', () => {
  it('renders project name and entity lists', () => {
    const project: ProjectData = {
      entity: {
        id: 'ent-proj',
        name: 'test-project',
        type: 'project',
        slug: 'test-project',
        description: 'A test project',
        created_at: '2026-01-01',
      },
      entities: [
        { id: 'e1', name: 'Widget', type: 'component', slug: 'widget', created_at: '2026-01-01' },
      ],
      substantive_entities: [
        { id: 'e1', name: 'Widget', type: 'component', slug: 'widget', created_at: '2026-01-01' },
      ],
      sparse_entities: [],
      episodics: [],
      semantics: [],
    };

    const result = renderProjectIndex(project);
    expect(result).toContain('# test-project');
    expect(result).toContain('A test project');
    expect(result).toContain('Widget');
  });
});

// Decisions page

describe('renderDecisionsPage', () => {
  it('renders decisions grouped by project', () => {
    const semantics = [
      {
        id: 'sem-1',
        content: 'Use event sourcing for orders',
        confidence: 0.85,
        tags: ['project:store', 'architecture'],
        entities: ['OrderSystem'],
      },
      {
        id: 'sem-2',
        content: 'Use REST over GraphQL',
        confidence: 0.7,
        tags: ['project:api', 'api-design'],
        entities: ['API'],
      },
    ];

    const result = renderDecisionsPage(semantics);
    expect(result).toContain('# Decisions');
    expect(result).toContain('event sourcing');
    expect(result).toContain('REST over GraphQL');
    expect(result).toContain('0.85');
  });

  it('handles unscoped semantics', () => {
    const semantics = [
      {
        id: 'sem-u',
        content: 'General principle about testing',
        confidence: 0.6,
        tags: ['testing'],
        entities: [],
      },
    ];

    const result = renderDecisionsPage(semantics);
    expect(result).toContain('Unscoped');
    expect(result).toContain('testing');
  });
});

// Patterns page

describe('renderPatternsPage', () => {
  it('shows cross-project patterns', () => {
    const semantics = [
      {
        id: 'sem-a',
        content: 'Use Zod for validation',
        confidence: 0.9,
        tags: ['project:api', 'validation'],
        entities: [],
      },
      {
        id: 'sem-b',
        content: 'Validate inputs with Zod schemas',
        confidence: 0.8,
        tags: ['project:store', 'validation'],
        entities: [],
      },
    ];

    const result = renderPatternsPage(semantics);
    expect(result).toContain('# Cross-Project Patterns');
    expect(result).toContain('validation');
    expect(result).toContain('2 projects');
  });

  it('shows empty state when no cross-project patterns', () => {
    const semantics = [
      {
        id: 'sem-x',
        content: 'Only in one project',
        confidence: 0.5,
        tags: ['project:solo', 'unique-tag'],
        entities: [],
      },
    ];

    const result = renderPatternsPage(semantics);
    expect(result).toContain('No cross-project patterns detected yet');
  });
});

// Recent changes

describe('renderRecentChanges', () => {
  it('renders episodic entries grouped by date', () => {
    const episodics: EpisodicEntry[] = [
      {
        id: 'ep-1',
        task: '[project:test] Task A',
        content: '[project:test] Did something',
        outcome: 'approved',
        session_id: 'sess-1',
        created_at: '2026-04-09T10:00:00Z',
        project_scope: 'test',
      },
      {
        id: 'ep-2',
        task: '[project:test] Task B',
        content: '[project:test] Did another thing',
        outcome: null,
        session_id: 'sess-1',
        created_at: '2026-04-09T11:00:00Z',
        project_scope: 'test',
      },
    ];

    const result = renderRecentChanges(episodics);
    expect(result).toContain('# Recent Changes');
    expect(result).toContain('2026-04-09');
    expect(result).toContain('Task A');
    expect(result).toContain('[APPROVED]');
  });

  it('handles empty episodics', () => {
    const result = renderRecentChanges([]);
    expect(result).toContain('No recent activity');
  });
});

// Project graph

describe('renderProjectGraph', () => {
  it('renders mermaid graph with entity nodes', () => {
    const project: ProjectData = {
      entity: {
        id: 'ent-proj',
        name: 'test-project',
        type: 'project',
        slug: 'test-project',
        created_at: '2026-01-01',
      },
      entities: [],
      substantive_entities: [
        { id: 'e1', name: 'ECS', type: 'system', slug: 'ecs', created_at: '2026-01-01' },
        { id: 'e2', name: 'Renderer', type: 'system', slug: 'renderer', created_at: '2026-01-01' },
      ],
      sparse_entities: [],
      episodics: [],
      semantics: [],
    };

    const result = renderProjectGraph(project);
    expect(result).toContain('```mermaid');
    expect(result).toContain('graph LR');
    expect(result).toContain('ECS');
    expect(result).toContain('Renderer');
    expect(result).toContain('classDef project');
  });
});

// Portal homepage

describe('renderPortalHomepage', () => {
  it('renders stats bar and project table', () => {
    const data: PortalData = {
      projects: [
        {
          name: 'mars-fps',
          slug: 'mars-fps',
          description: 'FPS game on Mars',
          entity_count: 10,
          semantic_count: 5,
          episodic_count: 20,
          last_activity: '2026-04-09T10:00:00Z',
        },
      ],
      recent_changes: [],
      top_decisions: [
        {
          content: 'Use ECS architecture',
          confidence: 0.95,
          project: 'mars-fps',
          entities: ['ECS'],
        },
      ],
      stats: {
        total_entities: 20,
        total_semantics: 10,
        total_episodics: 50,
        total_sources: 3,
        total_projects: 1,
      },
    };

    const result = renderPortalHomepage(data);
    expect(result).toContain('# AMP Knowledge Portal');
    expect(result).toContain('**1** projects');
    expect(result).toContain('mars-fps');
    expect(result).toContain('Use ECS architecture');
    expect(result).toContain('0.95');
  });
});

// Topic page

describe('renderTopicPage', () => {
  it('renders topic with semantics grouped by project', () => {
    const topic: TopicData = {
      tag: 'architecture',
      slug: 'architecture',
      semantics: [
        { content: 'Use ECS', confidence: 0.9, project: 'mars-fps', entities: ['ECS'] },
        { content: 'Use MVC', confidence: 0.7, project: 'web-app', entities: ['Controller'] },
      ],
      episodics: [],
      projects: ['mars-fps', 'web-app'],
      related_tags: ['design-patterns'],
      related_entities: ['ECS', 'Controller'],
    };

    const result = renderTopicPage(topic);
    expect(result).toContain('# architecture');
    expect(result).toContain('2 project(s)');
    expect(result).toContain('Use ECS');
    expect(result).toContain('Use MVC');
    expect(result).toContain('## Related Topics');
    expect(result).toContain('design-patterns');
  });
});

// Library index

describe('renderLibraryIndex', () => {
  it('renders sources grouped by type', () => {
    const sources: SourceInfo[] = [
      {
        id: 'src-1',
        title: 'API Design Guide',
        source_type: 'article',
        path: '/docs/api.md',
        project_tag: 'project:api',
        created_at: '2026-01-01',
      },
      {
        id: 'src-2',
        title: 'Research Paper',
        source_type: 'paper',
        path: '/docs/paper.pdf',
        project_tag: 'project:research',
        created_at: '2026-02-01',
      },
    ];
    const claimCounts = new Map([['src-1', 3], ['src-2', 0]]);

    const result = renderLibraryIndex(sources, claimCounts);
    expect(result).toContain('# Source Library');
    expect(result).toContain('2 sources indexed');
    expect(result).toContain('API Design Guide');
    expect(result).toContain('3 claim(s)');
    expect(result).toContain('Research Paper');
  });
});

// Library page

describe('renderLibraryPage', () => {
  it('renders source with claims and entity links', () => {
    const page: LibraryPage = {
      source: {
        id: 'src-1',
        title: 'API Design Guide',
        source_type: 'article',
        path: '/docs/api.md',
        project_tag: 'project:api',
        created_at: '2026-03-15T00:00:00Z',
      },
      claims: [
        {
          content: 'RESTful APIs should be versioned',
          confidence: 0.8,
          amp_id: 'sem-c1',
          source_refs: ['src-1'],
          entity_refs: ['API', 'Versioning'],
        },
      ],
      entity_links: ['API', 'Versioning'],
    };

    const result = renderLibraryPage(page);
    expect(result).toContain('# API Design Guide');
    expect(result).toContain('article');
    expect(result).toContain('RESTful APIs should be versioned');
    expect(result).toContain('0.80');
    expect(result).toContain('## Related Entities');
  });
});

// Topic index

describe('renderTopicIndex', () => {
  it('renders topic table sorted by fact count', () => {
    const topics: TopicData[] = [
      {
        tag: 'security',
        slug: 'security',
        semantics: [{ content: 'a', confidence: 0.5, project: 'x', entities: [] }],
        episodics: [],
        projects: ['x'],
        related_tags: [],
        related_entities: [],
      },
      {
        tag: 'architecture',
        slug: 'architecture',
        semantics: [
          { content: 'b', confidence: 0.5, project: 'x', entities: [] },
          { content: 'c', confidence: 0.5, project: 'y', entities: [] },
        ],
        episodics: [],
        projects: ['x', 'y'],
        related_tags: [],
        related_entities: [],
      },
    ];

    const result = renderTopicIndex(topics);
    expect(result).toContain('# Topics');
    // architecture has 2 facts, should come first
    const archPos = result.indexOf('architecture');
    const secPos = result.indexOf('security');
    expect(archPos).toBeLessThan(secPos);
  });
});
