// packages/mcp/src/__tests__/codebase-scanner.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanCodebase } from '../codebase-scanner.js';

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'amp-scan-test-'));

  // Create a realistic project structure
  await writeFile(
    join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      description: 'A test project for scanning',
      dependencies: { express: '^4.0.0' },
      workspaces: ['packages/*'],
    }),
  );

  // Create src/ directory with TypeScript files
  await mkdir(join(tempDir, 'src'), { recursive: true });
  await writeFile(join(tempDir, 'src', 'index.ts'), 'export const main = () => {};\n');
  await writeFile(join(tempDir, 'src', 'utils.ts'), 'export function helper() { return 1; }\n');

  // Create a subdirectory component with multiple files
  await mkdir(join(tempDir, 'src', 'auth'), { recursive: true });
  await writeFile(join(tempDir, 'src', 'auth', 'login.ts'), 'export function login() {}\n');
  await writeFile(join(tempDir, 'src', 'auth', 'session.ts'), 'export class Session {}\n');
  await writeFile(join(tempDir, 'src', 'auth', 'types.ts'), 'export interface User {}\n');

  // Create a workspace package
  await mkdir(join(tempDir, 'packages', 'core'), { recursive: true });
  await writeFile(
    join(tempDir, 'packages', 'core', 'package.json'),
    JSON.stringify({ name: '@test/core', description: 'Core package' }),
  );
  await writeFile(join(tempDir, 'packages', 'core', 'index.ts'), 'export const core = true;\n');

  // Create a test file (should be excluded from source files)
  await mkdir(join(tempDir, 'src', '__tests__'), { recursive: true });
  await writeFile(join(tempDir, 'src', '__tests__', 'utils.test.ts'), 'test("test", () => {});\n');

  // Create a Python file to test multi-language detection
  await writeFile(join(tempDir, 'src', 'script.py'), 'def main(): pass\n');

  // Create node_modules (should be excluded)
  await mkdir(join(tempDir, 'node_modules', 'express'), { recursive: true });
  await writeFile(join(tempDir, 'node_modules', 'express', 'index.js'), 'module.exports = {};\n');
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('scanCodebase', () => {
  it('detects project metadata from package.json', async () => {
    const scan = await scanCodebase(tempDir);
    expect(scan.name).toBe('test-project');
    expect(scan.description).toBe('A test project for scanning');
    expect(scan.domain).toBe('api-server'); // express detected
  });

  it('detects languages from file extensions', async () => {
    const scan = await scanCodebase(tempDir);
    expect(scan.languages).toContain('typescript');
    expect(scan.languages).toContain('python');
    // TypeScript should rank first (more files)
    expect(scan.languages[0]).toBe('typescript');
  });

  it('discovers source files while excluding tests and node_modules', async () => {
    const scan = await scanCodebase(tempDir);
    // Should include src/ files
    expect(scan.sourceFiles.some((f) => f.endsWith('src/index.ts'))).toBe(true);
    expect(scan.sourceFiles.some((f) => f.endsWith('src/utils.ts'))).toBe(true);
    expect(scan.sourceFiles.some((f) => f.endsWith('auth/login.ts'))).toBe(true);
    // Should exclude test files
    expect(scan.sourceFiles.some((f) => f.includes('__tests__'))).toBe(false);
    expect(scan.sourceFiles.some((f) => f.includes('.test.'))).toBe(false);
    // Should exclude node_modules
    expect(scan.sourceFiles.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('discovers workspace packages as modules', async () => {
    const scan = await scanCodebase(tempDir);
    const coreModule = scan.modules.find((m) => m.name === 'core');
    expect(coreModule).toBeDefined();
    expect(coreModule!.type).toBe('module');
    expect(coreModule!.parent).toBe('test-project');
  });

  it('discovers src subdirectories as components', async () => {
    const scan = await scanCodebase(tempDir);
    const authComponent = scan.modules.find((m) => m.name === 'auth');
    expect(authComponent).toBeDefined();
    expect(authComponent!.type).toBe('component');
  });

  it('discovers source directories', async () => {
    const scan = await scanCodebase(tempDir);
    const srcModule = scan.modules.find((m) => m.name === 'src');
    expect(srcModule).toBeDefined();
    expect(srcModule!.type).toBe('module');
  });

  it('finds entry points', async () => {
    const scan = await scanCodebase(tempDir);
    expect(scan.entryPoints.some((f) => f.endsWith('src/index.ts'))).toBe(true);
  });

  it('respects language filter', async () => {
    const scan = await scanCodebase(tempDir, { languages: ['python'] });
    expect(scan.languages).toEqual(['python']);
    expect(scan.sourceFiles.every((f) => f.endsWith('.py'))).toBe(true);
  });

  it('respects custom exclude patterns', async () => {
    const scan = await scanCodebase(tempDir, { excludePatterns: ['packages'] });
    // Should not find workspace package files
    expect(scan.sourceFiles.some((f) => f.includes('packages/'))).toBe(false);
  });
});

describe('scanCodebase with minimal project', () => {
  let minimalDir: string;

  beforeAll(async () => {
    minimalDir = await mkdtemp(join(tmpdir(), 'amp-scan-minimal-'));
    // No manifest file — just a directory with a Go file
    await writeFile(join(minimalDir, 'main.go'), 'package main\nfunc main() {}\n');
  });

  afterAll(async () => {
    await rm(minimalDir, { recursive: true, force: true });
  });

  it('falls back to directory name for project name', async () => {
    const scan = await scanCodebase(minimalDir);
    // Name should be the basename of the temp directory
    expect(scan.name.length).toBeGreaterThan(0);
    expect(scan.languages).toContain('go');
  });
});
