// packages/mcp/src/index.ts
export { createAMPServer } from './server.js';
export type { AMPMCPServer } from './server.js';

export {
  registerTools,
  setServiceInstances,
  buildToolHandlers,
  TOOL_NAMES,
  DOMAIN_DESCRIPTIONS,
} from './tools.js';
export type {
  IAMPService,
  IConsolidationEngine,
  IScopedQuery,
  ToolHandlers,
  ToolDomain,
  ToolRegistry,
  DomainInfo,
  RegisteredTool,
  RegisteredToolSet,
} from './tools.js';

export { parseAmpUri, uriToLoadScope } from './uri.js';
export type { AmpUri } from './uri.js';
