// packages/arch/src/tools.ts
// MCP tools for the architectural graph domain.

import { z } from 'zod';
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ArchEntityProperties, StructuralRelationType, StabilityTier, ImpactResult, DriftResult } from './types.js';

// ─── Service interfaces (injected) ───────────────────────────────────────────

export interface IArchEntityStore {
  setArchProperties(entityName: string, props: Partial<ArchEntityProperties>): Promise<boolean>;
  getFullEntity(entityName: string, projectName?: string): Promise<Record<string, unknown> | null>;
  getChildren(entityName: string, projectName?: string): Promise<Array<{ name: string; category: string; responsibility: string }>>;
  findStale(): Promise<Array<{ name: string; last_indexed_at: string | null }>>;
}

export interface IAspectStore {
  create(input: { name: string; description: string; stability_tier: StabilityTier; implies?: string[]; anchors?: string[] }): Promise<string>;
  applyTo(aspectName: string, entityName: string, projectName?: string): Promise<void>;
  removeFrom(aspectName: string, entityName: string, projectName?: string): Promise<void>;
  getEffectiveAspects(entityName: string, projectName?: string): Promise<Array<{ name: string; stability_tier: string; description: string }>>;
  getEntitiesForAspect(aspectName: string, projectName?: string): Promise<string[]>;
  listAll(): Promise<Array<{ name: string; stability_tier: string; description: string }>>;
}

export interface IStructuralRelationStore {
  create(from: string, to: string, type: StructuralRelationType, properties?: Record<string, string>, projectName?: string): Promise<boolean>;
  getDependents(entityName: string, asOf?: string, projectName?: string): Promise<Array<{ name: string; relation: string }>>;
  getDependencies(entityName: string, asOf?: string, projectName?: string): Promise<Array<{ name: string; relation: string; interface_desc: string }>>;
  getCallGraph(entityName: string, depth?: number, asOf?: string): Promise<Array<{ from: string; to: string; relation: string; depth: number }>>;
}

export interface IImpactAnalyzer {
  blastRadius(entityName: string, asOf?: string, projectName?: string): Promise<ImpactResult>;
}

export interface IDriftDetector {
  checkFreshness(entityName: string, projectName?: string): Promise<DriftResult>;
  checkAll(projectName: string): Promise<DriftResult[]>;
  markFresh(entityName: string, projectName?: string): Promise<number>;
}

export interface IArchContextBuilder {
  renderMarkdown(entityName: string, maxTokens?: number, asOf?: string, projectName?: string): Promise<string>;
}

// ─── Service container ────────────────────────────────────────────────────────
//
// The tool layer depends on a single typed container of services rather than a
// scatter of module-level singletons. A process-default container backs the
// legacy setArchServiceInstances() injection point, while registerArchTools()
// also accepts an explicit container — the seam that makes per-session /
// multi-tenant service isolation possible without process globals.

export interface ArchServiceContainer {
  archEntityStore: IArchEntityStore | null;
  aspectStore: IAspectStore | null;
  relationStore: IStructuralRelationStore | null;
  impactAnalyzer: IImpactAnalyzer | null;
  driftDetector: IDriftDetector | null;
  archContextBuilder: IArchContextBuilder | null;
}

/** Build a container, defaulting any service not supplied to null. */
export function createArchContainer(partial: Partial<ArchServiceContainer> = {}): ArchServiceContainer {
  return {
    archEntityStore: partial.archEntityStore ?? null,
    aspectStore: partial.aspectStore ?? null,
    relationStore: partial.relationStore ?? null,
    impactAnalyzer: partial.impactAnalyzer ?? null,
    driftDetector: partial.driftDetector ?? null,
    archContextBuilder: partial.archContextBuilder ?? null,
  };
}

/** Process-default container, populated by setArchServiceInstances() at bootstrap. */
const defaultContainer: ArchServiceContainer = createArchContainer();

export function setArchServiceInstances(services: {
  archEntityStore: IArchEntityStore;
  aspectStore: IAspectStore;
  relationStore: IStructuralRelationStore;
  impactAnalyzer: IImpactAnalyzer;
  driftDetector: IDriftDetector;
  archContextBuilder: IArchContextBuilder;
}): void {
  // Full reset of the default container — a service omitted from `services` is
  // cleared (mirrors @memberry/mcp setServiceInstances reset semantics).
  defaultContainer.archEntityStore = services.archEntityStore;
  defaultContainer.aspectStore = services.aspectStore;
  defaultContainer.relationStore = services.relationStore;
  defaultContainer.impactAnalyzer = services.impactAnalyzer;
  defaultContainer.driftDetector = services.driftDetector;
  defaultContainer.archContextBuilder = services.archContextBuilder;
}

// ─── Tool names ──────────────────────────────────────────────────────────────

export const ARCH_TOOL_NAMES = [
  'berry_arch_register',
  'berry_arch_relate',
  'berry_arch_aspect',
  'berry_impact',
  'berry_arch_drift',
  'berry_arch_context',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textContent(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text }] };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerArchTools(
  server: McpServer,
  container: ArchServiceContainer = defaultContainer,
): RegisteredTool[] {
  // Destructure once into closure-captured locals. Handlers reference these by
  // the same names they used as module globals, so their bodies are unchanged —
  // but each call can now be bound to a different container.
  const {
    archEntityStore,
    aspectStore,
    relationStore,
    impactAnalyzer,
    driftDetector,
    archContextBuilder,
  } = container;

  const handles: RegisteredTool[] = [];

  // ─── berry_arch_register ──────────────────────────────────────────────────
  handles.push(server.tool(
    'berry_arch_register',
    'Enrich an existing Entity node with architectural properties: category, hierarchy depth, responsibility (what it IS), interface (how to USE it), internals (how it WORKS), and tracked source file paths. The entity must already exist from berry_bootstrap. Idempotent.',
    {
      entity_name: z.string().max(500).describe('Name of the entity to enrich (must already exist)'),
      category: z.enum(['project', 'domain', 'module', 'service', 'library', 'component', 'infrastructure', 'config']).optional()
        .describe('Architectural category'),
      depth: z.number().int().nonnegative().optional().describe('Hierarchy level (0=project, 1=domain, 2=module, etc.)'),
      responsibility: z.string().max(2000).optional().describe('WHAT: identity, boundaries, what it is NOT responsible for'),
      interface_desc: z.string().max(2000).optional().describe('HOW TO USE: public API, contracts, failure modes'),
      internals: z.string().max(2000).optional().describe('HOW IT WORKS: algorithms, business rules, design decisions'),
      file_paths: z.array(z.string()).optional().describe('Source file paths to track for drift detection'),
    },
    { idempotentHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!archEntityStore) throw new Error('Arch services not initialised');
      const props: Partial<ArchEntityProperties> = {};
      if (args.category !== undefined) props.category = args.category;
      if (args.depth !== undefined) props.depth = args.depth;
      if (args.responsibility !== undefined) props.responsibility = args.responsibility;
      if (args.interface_desc !== undefined) props.interface_desc = args.interface_desc;
      if (args.internals !== undefined) props.internals = args.internals;
      if (args.file_paths !== undefined) {
        props.file_paths = args.file_paths;
        props.file_hashes_json = '{}';
        props.stale = false;
        props.last_indexed_at = new Date().toISOString();
      }
      const updated = await archEntityStore.setArchProperties(args.entity_name, props);
      return textContent(JSON.stringify({ updated, entity: args.entity_name }));
    },
  ));

  // ─── berry_arch_relate ────────────────────────────────────────────────────
  handles.push(server.tool(
    'berry_arch_relate',
    'Create a typed structural relationship between two entities. Relationship types: USES (runtime dependency), CALLS (direct invocation), EXTENDS (inheritance), IMPLEMENTS (interface satisfaction), EMITS (event emission), LISTENS (event subscription). Both entities must already exist.',
    {
      from_entity: z.string().max(500).describe('Source entity name'),
      to_entity: z.string().max(500).describe('Target entity name'),
      type: z.enum(['USES', 'CALLS', 'EXTENDS', 'IMPLEMENTS', 'EMITS', 'LISTENS'])
        .describe('Relationship type'),
      properties: z.record(z.string()).optional()
        .describe('Optional properties (e.g., {consumes: "charge,refund"}, {event: "order.created"}, {failure: "retry 3x"})'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping duplicate entity names'),
    },
    // Non-empty: an empty `{}` makes the MCP SDK misparse the handler slot
    // ("typedHandler is not a function"). See ANN_WRITE note in @memberry/mcp tools.ts.
    { readOnlyHint: false } satisfies ToolAnnotations,
    async (args) => {
      if (!relationStore) throw new Error('Arch services not initialised');
      const created = await relationStore.create(
        args.from_entity, args.to_entity,
        args.type as StructuralRelationType,
        args.properties,
        args.project_name
      );
      return textContent(JSON.stringify({ created, from: args.from_entity, to: args.to_entity, type: args.type }));
    },
  ));

  // ─── berry_arch_aspect ────────────────────────────────────────────────────
  handles.push(server.tool(
    'berry_arch_aspect',
    'Create or manage a cross-cutting concern (aspect). Aspects represent patterns that apply horizontally across components (e.g., "rate-limiting", "hipaa", "audit-logging"). They have stability tiers predicting decay rate and can imply other aspects.',
    {
      action: z.enum(['create', 'apply', 'remove', 'list', 'get']).describe('Action to perform'),
      name: z.string().max(500).describe('Aspect name'),
      description: z.string().max(2000).optional().describe('What this concern requires (for "create")'),
      stability_tier: z.enum(['schema', 'protocol', 'implementation']).optional().default('implementation')
        .describe('Stability tier: schema (most stable) > protocol > implementation (least stable)'),
      implies: z.array(z.string()).optional().describe('Other aspect names this implies (for "create")'),
      anchors: z.array(z.string()).optional().describe('Code patterns that evidence this aspect (for "create")'),
      entity_name: z.string().max(2000).optional().describe('Entity to apply/remove aspect to/from'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping duplicate entity names'),
    },
    // Non-empty: an empty `{}` makes the MCP SDK misparse the handler slot
    // ("typedHandler is not a function"). See ANN_WRITE note in @memberry/mcp tools.ts.
    { readOnlyHint: false } satisfies ToolAnnotations,
    async (args) => {
      if (!aspectStore) throw new Error('Arch services not initialised');
      switch (args.action) {
        case 'create': {
          const id = await aspectStore.create({
            name: args.name,
            description: args.description ?? '',
            stability_tier: (args.stability_tier ?? 'implementation') as StabilityTier,
            implies: args.implies,
            anchors: args.anchors,
          });
          return textContent(JSON.stringify({ created: true, id, name: args.name }));
        }
        case 'apply': {
          if (!args.entity_name) throw new Error('entity_name required for "apply"');
          await aspectStore.applyTo(args.name, args.entity_name, args.project_name);
          return textContent(JSON.stringify({ applied: true, aspect: args.name, entity: args.entity_name }));
        }
        case 'remove': {
          if (!args.entity_name) throw new Error('entity_name required for "remove"');
          await aspectStore.removeFrom(args.name, args.entity_name, args.project_name);
          return textContent(JSON.stringify({ removed: true, aspect: args.name, entity: args.entity_name }));
        }
        case 'list': {
          const all = await aspectStore.listAll();
          return textContent(JSON.stringify(all, null, 2));
        }
        case 'get': {
          if (args.entity_name) {
            const effective = await aspectStore.getEffectiveAspects(args.entity_name, args.project_name);
            return textContent(JSON.stringify({ entity: args.entity_name, aspects: effective }, null, 2));
          }
          const entities = await aspectStore.getEntitiesForAspect(args.name, args.project_name);
          return textContent(JSON.stringify({ aspect: args.name, entities }, null, 2));
        }
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    },
  ));

  // ─── berry_impact ─────────────────────────────────────────────────────────
  handles.push(server.tool(
    'berry_impact',
    'Blast radius analysis: what breaks if this entity changes? Returns direct dependents, transitive dependents, co-aspect entities, affected aspects, and an overall change risk assessment (low/medium/high/critical). Optionally query as of a specific time.',
    {
      entity_name: z.string().max(2000).describe('Entity to analyze'),
      as_of: z.string().optional().describe('ISO timestamp — only traverse relationships active at this time (default: current)'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping duplicate entity names'),
    },
    { readOnlyHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!impactAnalyzer) throw new Error('Arch services not initialised');
      const result = await impactAnalyzer.blastRadius(args.entity_name, args.as_of, args.project_name);
      return textContent(JSON.stringify(result, null, 2));
    },
  ));

  // ─── berry_arch_drift ─────────────────────────────────────────────────────
  handles.push(server.tool(
    'berry_arch_drift',
    'Check if tracked source files have changed since last indexing. Compares SHA-256 hashes of files on disk against stored hashes. Use "check" to detect drift, "mark_fresh" to update hashes after reviewing changes, "check_all" to batch-check an entire project.',
    {
      action: z.enum(['check', 'mark_fresh', 'check_all', 'list_stale']).describe('Action to perform'),
      entity_name: z.string().max(2000).optional().describe('Entity name (for "check" and "mark_fresh")'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping duplicate entity names; required for "check_all"'),
    },
    { readOnlyHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!driftDetector) throw new Error('Arch services not initialised');
      switch (args.action) {
        case 'check': {
          if (!args.entity_name) throw new Error('entity_name required for "check"');
          const result = await driftDetector.checkFreshness(args.entity_name, args.project_name);
          return textContent(JSON.stringify(result, null, 2));
        }
        case 'mark_fresh': {
          if (!args.entity_name) throw new Error('entity_name required for "mark_fresh"');
          const count = await driftDetector.markFresh(args.entity_name, args.project_name);
          return textContent(JSON.stringify({ entity: args.entity_name, files_hashed: count }));
        }
        case 'check_all': {
          if (!args.project_name) throw new Error('project_name required for "check_all"');
          const results = await driftDetector.checkAll(args.project_name);
          const staleCount = results.filter((r) => r.stale).length;
          return textContent(JSON.stringify({ total: results.length, stale: staleCount, results }, null, 2));
        }
        case 'list_stale': {
          if (!archEntityStore) throw new Error('Arch services not initialised');
          const staleEntities = await archEntityStore.findStale();
          return textContent(JSON.stringify({ stale_entities: staleEntities }, null, 2));
        }
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    },
  ));

  // ─── berry_arch_context ───────────────────────────────────────────────────
  handles.push(server.tool(
    'berry_arch_context',
    'Deterministic architectural context assembly for an entity. Returns: responsibility, interface, internals, hierarchy (ancestors), children, dependencies with their interfaces, dependents (what breaks), and cross-cutting aspects. Same graph state always produces the same output — no ranking heuristics. Optionally query as of a specific time.',
    {
      entity_name: z.string().max(2000).describe('Entity to build context for'),
      max_tokens: z.number().int().positive().optional().default(6000)
        .describe('Max tokens for the context package'),
      include_children: z.boolean().optional().default(false)
        .describe('Include direct children of this entity in the context'),
      as_of: z.string().optional().describe('ISO timestamp — only traverse relationships active at this time (default: current)'),
      project_name: z.string().max(2000).optional().describe('Project name for scoping duplicate entity names'),
    },
    { readOnlyHint: true } satisfies ToolAnnotations,
    async (args) => {
      if (!archContextBuilder) throw new Error('Arch services not initialised');
      let md = await archContextBuilder.renderMarkdown(args.entity_name, args.max_tokens, args.as_of, args.project_name);

      // Append children section if requested
      if (args.include_children && archEntityStore) {
        const children = await archEntityStore.getChildren(args.entity_name, args.project_name);
        if (children.length > 0) {
          md += '\n## Children\n\n';
          for (const c of children) {
            md += `- **${c.name}** (${c.category}): ${c.responsibility}\n`;
          }
        }
      }

      return textContent(md);
    },
  ));

  return handles;
}
