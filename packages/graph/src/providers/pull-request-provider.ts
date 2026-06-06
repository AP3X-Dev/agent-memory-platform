/** Abstraction over a PR source (GitHub CLI, mocks in tests, other hosts later). */
export interface PullRequest {
  id: string;
  title?: string;
  changed_files: string[];
}

export interface PullRequestProvider {
  /** Changed file paths for a single PR reference (number, branch, or URL). */
  getChangedFiles(ref: string): Promise<string[]>;
  /** All open PRs with their changed files (for conflict analysis). */
  listOpenPullRequests(): Promise<PullRequest[]>;
}
