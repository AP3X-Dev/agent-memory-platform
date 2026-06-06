import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sqlExtractor } from '../extractors/sql.js';
import { terraformExtractor } from '../extractors/terraform.js';
import { mcpConfigExtractor } from '../extractors/mcp-config.js';
import { isExtractorLanguage, extractStructured } from '../extractors/registry.js';
import { detectLanguage } from '../types.js';
import { parseFile } from '../parser.js';

const NOW = '2026-06-06T00:00:00.000Z';

describe('detectLanguage', () => {
  it('routes by extension and by config basename', () => {
    expect(detectLanguage('schema.sql')).toBe('sql');
    expect(detectLanguage('main.tf')).toBe('terraform');
    expect(detectLanguage('vars.tfvars')).toBe('terraform');
    expect(detectLanguage('/repo/.mcp.json')).toBe('mcp-config'); // basename, despite .json ext
    expect(detectLanguage('/repo/mcp.json')).toBe('mcp-config');
    expect(detectLanguage('app.ts')).toBe('typescript');
    expect(detectLanguage('data.json')).toBeUndefined(); // plain json is not indexed
    expect(detectLanguage('README.md')).toBeUndefined();
  });
});

describe('sqlExtractor', () => {
  it('extracts tables, views, and functions', () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY, name TEXT);
      create or replace view active_users as select * from users;
      CREATE FUNCTION get_user(id INT) RETURNS users AS $$ ... $$;
      CREATE INDEX idx_users_name ON users(name);
    `;
    const syms = sqlExtractor.extract('schema.sql', sql, NOW);
    const byName = Object.fromEntries(syms.map((s) => [s.name, s.kind]));
    expect(byName['users']).toBe('table');
    expect(byName['active_users']).toBe('view');
    expect(byName['get_user']).toBe('function');
    expect(byName['idx_users_name']).toBe('variable');
    // signature is a single line (no multi-line function body leaks)
    expect(syms.every((s) => !s.signature.includes('\n'))).toBe(true);
  });
});

describe('terraformExtractor', () => {
  it('extracts resources, modules, variables, and outputs', () => {
    const tf = `
      resource "aws_s3_bucket" "data" { bucket = "x" }
      module "vpc" { source = "./vpc" }
      variable "region" { default = "us-east-1" }
      output "bucket_arn" { value = aws_s3_bucket.data.arn }
    `;
    const syms = terraformExtractor.extract('main.tf', tf, NOW);
    const byName = Object.fromEntries(syms.map((s) => [s.name, s.kind]));
    expect(byName['aws_s3_bucket.data']).toBe('resource');
    expect(byName['vpc']).toBe('module');
    expect(byName['region']).toBe('variable');
    expect(byName['bucket_arn']).toBe('variable');
  });
});

describe('mcpConfigExtractor', () => {
  it('extracts one symbol per server and NEVER leaks env or arg values', () => {
    const config = JSON.stringify({
      mcpServers: {
        db: {
          command: 'node',
          args: ['server.js', '--token', 'SECRET_ARG_TOKEN_123'],
          env: { API_KEY: 'sk-SECRET_ENV_VALUE_456' },
        },
        remote: { url: 'https://example.com/mcp' },
      },
    });
    const syms = mcpConfigExtractor.extract('.mcp.json', config, NOW);
    const names = syms.map((s) => s.name).sort();
    expect(names).toEqual(['db', 'remote']);
    expect(syms.every((s) => s.kind === 'config')).toBe(true);

    const serialized = JSON.stringify(syms);
    expect(serialized).not.toContain('SECRET_ARG_TOKEN_123');
    expect(serialized).not.toContain('sk-SECRET_ENV_VALUE_456');
    expect(serialized).not.toContain('API_KEY');
    // The command binary IS surfaced (useful, non-secret).
    expect(syms.find((s) => s.name === 'db')!.signature).toContain('node');
  });

  it('returns nothing for invalid JSON or a config without servers', () => {
    expect(mcpConfigExtractor.extract('x.json', 'not json', NOW)).toEqual([]);
    expect(mcpConfigExtractor.extract('x.json', '{"other": 1}', NOW)).toEqual([]);
  });
});

describe('registry', () => {
  it('recognizes extractor languages and routes them', () => {
    expect(isExtractorLanguage('sql')).toBe(true);
    expect(isExtractorLanguage('terraform')).toBe(true);
    expect(isExtractorLanguage('mcp-config')).toBe(true);
    expect(isExtractorLanguage('typescript')).toBe(false);

    const parsed = extractStructured('schema.sql', 'sql', 'CREATE TABLE t (id INT);', NOW);
    expect(parsed.language).toBe('sql');
    expect(parsed.symbols).toHaveLength(1);
    expect(parsed.relations).toEqual([]);
  });
});

describe('parseFile routing (end-to-end)', () => {
  it('parses a .sql file through the structural extractor (no tree-sitter)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'amp-ext-'));
    const p = path.join(dir, 'schema.sql');
    await writeFile(p, 'CREATE TABLE orders (id INT);\nCREATE VIEW v AS SELECT 1;', 'utf-8');
    const parsed = await parseFile(p, 'sql');
    expect(parsed.symbols.map((s) => s.name).sort()).toEqual(['orders', 'v']);
    expect(parsed.symbols.find((s) => s.name === 'orders')!.kind).toBe('table');
  });
});
