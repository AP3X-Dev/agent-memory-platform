// MCP config extractor: one symbol per configured server.
//
// SECRET-SAFETY (Correction C-15): never persist env values or raw argument
// values into signature/doc_comment — only the server name and command binary.
import type { SymbolNode } from '../types.js';
import { makeSymbol, type StructuralExtractor } from './types.js';

interface McpServerConfig {
  command?: unknown;
  url?: unknown;
  args?: unknown;
}

function serversOf(json: unknown): Record<string, McpServerConfig> | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  const candidate =
    (obj.mcpServers as unknown) ??
    (obj.servers as unknown) ??
    ((obj.mcp as Record<string, unknown> | undefined)?.servers as unknown);
  return candidate && typeof candidate === 'object'
    ? (candidate as Record<string, McpServerConfig>)
    : null;
}

export const mcpConfigExtractor: StructuralExtractor = {
  language: 'mcp-config',
  extract(filePath, source, now): SymbolNode[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return [];
    }
    const servers = serversOf(parsed);
    if (!servers) return [];

    const out: SymbolNode[] = [];
    for (const name of Object.keys(servers).sort()) {
      const cfg = servers[name] ?? {};
      const command =
        typeof cfg.command === 'string' ? cfg.command : typeof cfg.url === 'string' ? 'remote (url)' : 'unknown';
      const argc = Array.isArray(cfg.args) ? cfg.args.length : 0;
      // Command binary + arg COUNT only — never the arg/env VALUES.
      const signature = `mcp server: ${command}${argc ? ` (+${argc} args)` : ''}`;
      out.push(makeSymbol({ name, kind: 'config', language: 'mcp-config', filePath, startLine: 1, signature, now }));
    }
    return out;
  },
};
