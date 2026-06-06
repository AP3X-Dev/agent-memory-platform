/**
 * GitHub CLI-backed PR provider. Shells out to `gh` (no API token handling here).
 * If `gh` is missing or unauthenticated, calls throw an actionable error so the
 * MCP tool can report it cleanly rather than crashing.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PullRequest, PullRequestProvider } from './pull-request-provider.js';

const execFileAsync = promisify(execFile);

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    throw new Error(
      `GitHub CLI (gh) is required but failed or is not installed/authenticated: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export class GitHubCliProvider implements PullRequestProvider {
  async getChangedFiles(ref: string): Promise<string[]> {
    const out = await gh(['pr', 'view', ref, '--json', 'files']);
    const parsed = JSON.parse(out) as { files?: Array<{ path?: string }> };
    return (parsed.files ?? []).map((f) => f.path).filter((p): p is string => typeof p === 'string');
  }

  async listOpenPullRequests(): Promise<PullRequest[]> {
    const out = await gh(['pr', 'list', '--state', 'open', '--json', 'number,title']);
    const list = JSON.parse(out) as Array<{ number: number; title?: string }>;
    const prs: PullRequest[] = [];
    for (const p of list) {
      const id = String(p.number);
      prs.push({ id, title: p.title, changed_files: await this.getChangedFiles(id) });
    }
    return prs;
  }
}
