// packages/wiki/src/compile.ts
// V2 compiler: walks the AMP graph and compiles a multi-project wiki with
// subdirectory layout, episodic history, library, topics, and portal homepage.

import type { Driver } from 'neo4j-driver';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CompileV2Result,
  EntityInfo,
  EpisodicEntry,
  ProjectData,
  LibraryPage,
  TopicData,
  PortalData,
  ArticleFrontmatter,
  ResolvedClaim,
} from './types.js';
import {
  fetchAllProjects,
  fetchEpisodicProjectScopes,
  fetchProjectEntities,
  fetchEntitiesModifiedByProject,
  fetchSemanticsForEntity,
  fetchEpisodicsForProject,
  fetchEpisodicsForEntity,
  fetchHierarchy,
  fetchBacklinks,
  fetchRelatedEntities,
  fetchSourcesForEntity,
  fetchInboundLinkCount,
  fetchAllSources,
  fetchClaimsForSource,
  fetchAllTags,
  fetchAllSemantics,
  fetchGraphStats,
  fetchRecentEpisodics,
} from './queries.js';
import {
  renderFrontmatter,
  renderEntityArticle,
  renderProjectIndex,
  renderPortalHomepage,
  renderLibraryIndex,
  renderLibraryPage,
  renderTopicIndex,
  renderTopicPage,
  renderDecisionsPage,
  renderPatternsPage,
  renderRecentChanges,
  renderProjectGraph,
} from './renderers.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Resolve entity references in claim text to [[wikilinks]] */
function resolveInlineLinks(text: string, entityRefs: string[], projectSlug: string): string {
  let resolved = text;
  const sorted = [...entityRefs].sort((a, b) => b.length - a.length);
  for (const ref of sorted) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(resolved)) {
      const entitySlug = slugify(ref);
      resolved = resolved.replace(re, `[[projects/${projectSlug}/${entitySlug}|${ref}]]`);
    }
  }
  return resolved;
}

async function writeMarkdown(filePath: string, content: string): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

// ─── Main compiler ──────────────────────────────────────────────────────────

export class WikiCompiler {
  constructor(private driver: Driver) {}

  async compile(outputDir: string): Promise<CompileV2Result> {
    const result: CompileV2Result = {
      projects_compiled: 0,
      articles_compiled: 0,
      episodics_rendered: 0,
      library_pages: 0,
      topic_pages: 0,
      cross_project_pages: 0,
      output_dir: outputDir,
    };

    // Clean output directory
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    // ── Phase 0: Pre-fetch shared data ─────────────────────────────

    // Fetch all semantics ONCE and build indexes for O(1) lookups
    const allSemantics = await fetchAllSemantics(this.driver);

    // Index: entity name (lowercase) → semantics ABOUT that entity
    const semanticsByEntity = new Map<string, typeof allSemantics>();
    // Index: entity name (lowercase) → semantics that MENTION entity in content
    const semanticsMentioningEntity = new Map<string, typeof allSemantics>();
    // Index: tag → semantics carrying that tag
    const semanticsByTag = new Map<string, typeof allSemantics>();

    for (const sem of allSemantics) {
      // Build entity index (by ABOUT relationship)
      for (const entityName of sem.entities) {
        const key = entityName.toLowerCase();
        const existing = semanticsByEntity.get(key) ?? [];
        existing.push(sem);
        semanticsByEntity.set(key, existing);
      }

      // Build tag index
      for (const tag of sem.tags) {
        const existing = semanticsByTag.get(tag) ?? [];
        existing.push(sem);
        semanticsByTag.set(tag, existing);
      }
    }

    // Build mention index (which semantics mention an entity by name in content)
    // We need all unique entity names first, so defer this until after entity discovery

    // ── Phase 1: Discover all projects ────────────────────────────────

    const projectEntities = await fetchAllProjects(this.driver);
    const episodicOnlyScopes = await fetchEpisodicProjectScopes(this.driver);

    // Build full project list: entity-based + episodic-only (virtual)
    const allProjectData: ProjectData[] = [];

    // Entity-based projects
    for (const projectEntity of projectEntities) {
      const projectName = projectEntity.name;
      const projectScope = projectName; // e.g. "mars-fps"

      const [containedEntities, modifiedEntities, episodics] = await Promise.all([
        fetchProjectEntities(this.driver, projectName),
        fetchEntitiesModifiedByProject(this.driver, projectScope),
        fetchEpisodicsForProject(this.driver, projectScope),
      ]);

      // Merge contained and modified entities, dedup by id
      const entityMap = new Map<string, EntityInfo>();
      for (const e of containedEntities) entityMap.set(e.id, e);
      for (const e of modifiedEntities) {
        if (!entityMap.has(e.id)) entityMap.set(e.id, e);
      }
      const entities = [...entityMap.values()];

      // Build mention index for this project's entities (lazy, cached)
      for (const entity of entities) {
        const key = entity.name.toLowerCase();
        if (!semanticsMentioningEntity.has(key)) {
          const mentions = allSemantics.filter(
            (s) => s.content.toLowerCase().includes(key),
          );
          semanticsMentioningEntity.set(key, mentions);
        }
      }

      // Classify: substantive = 1+ semantic OR 1+ episodic mention
      const substantive: EntityInfo[] = [];
      const sparse: EntityInfo[] = [];

      // Batch-fetch episodics for all entities in this project
      const entityEpisodicMap = new Map<string, EpisodicEntry[]>();
      const episodicPromises = entities.map(async (entity) => {
        const eps = await fetchEpisodicsForEntity(this.driver, entity.name);
        entityEpisodicMap.set(entity.name, eps);
      });
      await Promise.all(episodicPromises);

      for (const entity of entities) {
        const key = entity.name.toLowerCase();
        const semCount = (semanticsByEntity.get(key) ?? []).length;
        const entityEpisodics = entityEpisodicMap.get(entity.name) ?? [];
        const semMentions = semanticsMentioningEntity.get(key) ?? [];
        if (semCount > 0 || entityEpisodics.length > 0 || semMentions.length > 0) {
          substantive.push(entity);
        } else {
          sparse.push(entity);
        }
      }

      // Build semantics for project-level data from pre-fetched index
      const semantics: ProjectData['semantics'] = [];
      const seenSemanticIds = new Set<string>();
      for (const entity of entities) {
        const sems = semanticsByEntity.get(entity.name.toLowerCase()) ?? [];
        for (const sem of sems) {
          if (seenSemanticIds.has(sem.id)) continue;
          seenSemanticIds.add(sem.id);
          semantics.push({
            id: sem.id,
            content: sem.content,
            confidence: sem.confidence,
            tags: sem.tags,
            entities: sem.entities.filter((e) => e !== entity.name),
          });
        }
      }

      allProjectData.push({
        entity: projectEntity,
        entities,
        substantive_entities: substantive,
        sparse_entities: sparse,
        episodics,
        semantics,
      });
    }

    // Episodic-only projects (virtual)
    for (const scope of episodicOnlyScopes) {
      const episodics = await fetchEpisodicsForProject(this.driver, scope);
      if (episodics.length === 0) continue;

      const virtualEntity: EntityInfo = {
        id: `virtual-${scope}`,
        name: scope,
        type: 'project',
        slug: slugify(scope),
        description: `Project discovered from episodic entries (no Entity node).`,
        created_at: episodics[episodics.length - 1]?.created_at ?? new Date().toISOString(),
      };

      allProjectData.push({
        entity: virtualEntity,
        entities: [],
        substantive_entities: [],
        sparse_entities: [],
        episodics,
        semantics: [],
      });
    }

    // ── Phase 2: Build entity articles per project ────────────────────

    for (const project of allProjectData) {
      const projectSlug = slugify(project.entity.name);
      const projectDir = join(outputDir, 'projects', projectSlug);

      // Build articles for substantive entities
      for (const entity of project.substantive_entities) {
        const [semantics, hierarchy, backlinks, seeAlso, sources, inboundCount, entityEpisodics] =
          await Promise.all([
            fetchSemanticsForEntity(this.driver, entity.name),
            fetchHierarchy(this.driver, entity.name),
            fetchBacklinks(this.driver, entity.name),
            fetchRelatedEntities(this.driver, entity.name),
            fetchSourcesForEntity(this.driver, entity.name),
            fetchInboundLinkCount(this.driver, entity.name),
            fetchEpisodicsForEntity(this.driver, entity.name),
          ]);

        // Group semantics by domain tag into sections
        const sectionMap = new Map<string, ResolvedClaim[]>();
        let totalConfidence = 0;
        let confidenceCount = 0;

        for (const sem of semantics) {
          const otherRefs = sem.entity_refs.filter((r) => r !== entity.name);
          const claim: ResolvedClaim = {
            content: resolveInlineLinks(sem.content, otherRefs, projectSlug),
            confidence: sem.confidence,
            amp_id: sem.id,
            source_refs: [],
            entity_refs: otherRefs,
          };

          totalConfidence += sem.confidence;
          confidenceCount++;

          const domainTag = sem.tags.find((t) => !t.startsWith('project:')) ?? 'general';
          const existing = sectionMap.get(domainTag) ?? [];
          existing.push(claim);
          sectionMap.set(domainTag, existing);
        }

        const sections = [...sectionMap.entries()].map(([tag, claims]) => ({
          heading: tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' '),
          claims,
        }));

        const allTags = [...new Set(semantics.flatMap((s) => s.tags))];
        const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

        const frontmatter: ArticleFrontmatter = {
          entity: slugify(entity.name),
          type: entity.type,
          confidence: avgConfidence,
          sources: sources.length,
          inbound_links: inboundCount,
          last_compiled: new Date().toISOString().split('T')[0],
          amp_id: entity.id,
          aliases: entity.aliases ?? [],
          tags: allTags,
          parent: hierarchy.parent,
          children: hierarchy.children.length > 0 ? hierarchy.children : undefined,
        };

        const articleData = {
          entity,
          frontmatter,
          sections,
          backlinks,
          see_also: seeAlso,
          sources,
          hierarchy,
          projectSlug,
        };

        const markdown = renderEntityArticle(articleData, entityEpisodics);
        await writeMarkdown(join(projectDir, `${slugify(entity.name)}.md`), markdown);
        result.articles_compiled++;
        result.episodics_rendered += entityEpisodics.length;
      }

      // Graph page
      const graphMarkdown = renderProjectGraph(project);
      await writeMarkdown(join(projectDir, '_graph.md'), graphMarkdown);

      // Project index
      const indexMarkdown = renderProjectIndex(project);
      await writeMarkdown(join(projectDir, '_index.md'), indexMarkdown);

      result.projects_compiled++;
    }

    // ── Phase 3: Library ──────────────────────────────────────────────

    const allSources = await fetchAllSources(this.driver);

    if (allSources.length > 0) {
      const libraryDir = join(outputDir, 'library');
      const claimCounts = new Map<string, number>();

      for (const source of allSources) {
        const claims = await fetchClaimsForSource(this.driver, source.id);
        claimCounts.set(source.id, claims.length);

        const entityLinks = [...new Set(claims.flatMap((c) => c.entity_refs))];

        const page: LibraryPage = {
          source,
          claims,
          entity_links: entityLinks,
        };

        const markdown = renderLibraryPage(page);
        await writeMarkdown(join(libraryDir, `${slugify(source.title)}.md`), markdown);
        result.library_pages++;
      }

      // Library index
      const libraryIndexMarkdown = renderLibraryIndex(allSources, claimCounts);
      await writeMarkdown(join(libraryDir, '_index.md'), libraryIndexMarkdown);
    } else {
      // Always create library directory with empty-state index
      const libraryDir = join(outputDir, 'library');
      const emptyLibrary = renderFrontmatter({ title: 'Source Library', compiled: new Date().toISOString().split('T')[0], sources: 0 }) + '\n\n# Source Library\n\n*No sources indexed yet. Sources will appear here as they are added to the knowledge graph.*\n';
      await writeMarkdown(join(libraryDir, '_index.md'), emptyLibrary);
    }

    // ── Phase 4: Topics ───────────────────────────────────────────────

    const allTags = await fetchAllTags(this.driver);
    const qualifiedTags = allTags.filter((t) => t.count >= 3 || (t.projects.length >= 2));

    // Build tag→projects map from pre-fetched allSemantics (no extra query)
    const tagProjectMap = new Map<string, Set<string>>();
    for (const sem of allSemantics) {
      const projectTag = sem.tags.find((t) => t.startsWith('project:'));
      const proj = projectTag ? projectTag.replace('project:', '') : null;
      for (const tag of sem.tags) {
        if (tag.startsWith('project:')) continue;
        const projects = tagProjectMap.get(tag) ?? new Set();
        if (proj) projects.add(proj);
        tagProjectMap.set(tag, projects);
      }
    }

    // Merge: count >= 3 OR 2+ projects
    const topicTagSet = new Set(qualifiedTags.map((t) => t.tag));
    for (const [tag, projects] of tagProjectMap) {
      if (projects.size >= 2) topicTagSet.add(tag);
    }

    // Pre-build co-occurring tag map: for each tag, which other topic-tags co-occur
    // This avoids the O(topics * allSemantics) nested scan
    const coTagMap = new Map<string, Set<string>>();
    for (const sem of allSemantics) {
      const nonProjectTags = sem.tags.filter((t) => !t.startsWith('project:'));
      for (const tag of nonProjectTags) {
        if (!topicTagSet.has(tag)) continue;
        for (const other of nonProjectTags) {
          if (other !== tag && topicTagSet.has(other)) {
            const existing = coTagMap.get(tag) ?? new Set();
            existing.add(other);
            coTagMap.set(tag, existing);
          }
        }
      }
    }

    if (topicTagSet.size > 0) {
      const topicsDir = join(outputDir, 'topics');
      const topicDataList: TopicData[] = [];

      for (const tag of topicTagSet) {
        // Use pre-indexed semanticsByTag instead of per-tag DB query
        const tagSems = semanticsByTag.get(tag) ?? [];

        // Determine projects this tag appears in
        const projects = new Set<string>();
        const entities = new Set<string>();
        const semanticsWithProject: TopicData['semantics'] = [];

        for (const sem of tagSems) {
          for (const e of sem.entities) entities.add(e);
          // Project is already available from the full semantic data (no .find() needed)
          const projectTag = sem.tags.find((t) => t.startsWith('project:'));
          const proj = projectTag ? projectTag.replace('project:', '') : 'unscoped';
          projects.add(proj);

          semanticsWithProject.push({
            content: sem.content,
            confidence: sem.confidence,
            project: proj,
            entities: sem.entities,
          });
        }

        // Use pre-built co-tag map instead of scanning allSemantics
        const coTags = coTagMap.get(tag) ?? new Set<string>();

        const topicData: TopicData = {
          tag,
          slug: slugify(tag),
          semantics: semanticsWithProject,
          episodics: [], // Could fetch scoped episodics but keeping it light
          projects: [...projects],
          related_tags: [...coTags],
          related_entities: [...entities],
        };

        topicDataList.push(topicData);

        const markdown = renderTopicPage(topicData);
        await writeMarkdown(join(topicsDir, `${slugify(tag)}.md`), markdown);
        result.topic_pages++;
      }

      // Topics index
      const topicIndexMarkdown = renderTopicIndex(topicDataList);
      await writeMarkdown(join(topicsDir, '_index.md'), topicIndexMarkdown);
    } else {
      // Always create topics directory with empty-state index
      const topicsDir = join(outputDir, 'topics');
      const emptyTopics = renderFrontmatter({ title: 'Topics', compiled: new Date().toISOString().split('T')[0], topics: 0 }) + '\n\n# Topics\n\n*No topics discovered yet. Topics emerge when tags appear across multiple projects or reach critical mass.*\n';
      await writeMarkdown(join(topicsDir, '_index.md'), emptyTopics);
    }

    // ── Phase 5: Cross-project pages ──────────────────────────────────

    // Decisions page
    const decisionsMarkdown = renderDecisionsPage(allSemantics);
    await writeMarkdown(join(outputDir, '_decisions.md'), decisionsMarkdown);
    result.cross_project_pages++;

    // Patterns page
    const patternsMarkdown = renderPatternsPage(allSemantics);
    await writeMarkdown(join(outputDir, '_patterns.md'), patternsMarkdown);
    result.cross_project_pages++;

    // Recent changes
    const recentEpisodics = await fetchRecentEpisodics(this.driver, 50);
    const recentMarkdown = renderRecentChanges(recentEpisodics);
    await writeMarkdown(join(outputDir, '_recent.md'), recentMarkdown);
    result.cross_project_pages++;

    // ── Phase 6: Portal homepage ──────────────────────────────────────

    const graphStats = await fetchGraphStats(this.driver);

    const portalData: PortalData = {
      projects: allProjectData.map((p) => ({
        name: p.entity.name,
        slug: slugify(p.entity.name),
        description: p.entity.description ?? null,
        entity_count: p.entities.length,
        semantic_count: p.semantics.length,
        episodic_count: p.episodics.length,
        last_activity: p.episodics[0]?.created_at ?? null,
      })),
      recent_changes: recentEpisodics.slice(0, 10),
      top_decisions: allSemantics
        .filter((s) => s.confidence >= 0.7)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 15)
        .map((s) => ({
          content: s.content,
          confidence: s.confidence,
          project: (s.tags.find((t) => t.startsWith('project:')) ?? 'project:unscoped').replace('project:', ''),
          entities: s.entities,
        })),
      stats: {
        ...graphStats,
        total_projects: allProjectData.length,
      },
    };

    const portalMarkdown = renderPortalHomepage(portalData);
    await writeMarkdown(join(outputDir, '_index.md'), portalMarkdown);

    return result;
  }
}
