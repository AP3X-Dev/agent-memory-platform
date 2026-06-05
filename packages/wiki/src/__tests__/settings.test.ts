// packages/wiki/src/__tests__/settings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  renderSettingsBody,
  applyHooksTuning,
  runHooksInstall,
  getSettingsData,
} from '../settings.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-wiki-settings-'));
  process.env.AMP_SETTINGS_PATH = path.join(dir, 'settings.json');
});
afterEach(() => {
  delete process.env.AMP_SETTINGS_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('settings module', () => {
  it('renders all settings sections', () => {
    const html = renderSettingsBody(dir);
    for (const marker of ['Agent hooks', 'Claude Code', 'OpenAI Codex', 'Nous Hermes', 'Hook tuning', 'Server config']) {
      expect(html).toContain(marker);
    }
  });

  it('getSettingsData reports no hooks installed in a fresh dir', () => {
    const data = getSettingsData(dir);
    expect(data.hooks.claude.every((c) => c.events.length === 0)).toBe(true);
    expect(data.hooks.materialized.every((m) => !m.present)).toBe(true);
  });

  it('applyHooksTuning persists and reflects file source', () => {
    const config = applyHooksTuning({ timeoutMs: 1500, turnTokens: 2200, sessionTimeoutMs: 9000 });
    expect(config.hookTuning.timeoutMs).toEqual({ value: 1500, source: 'file' });
    expect(fs.existsSync(process.env.AMP_SETTINGS_PATH!)).toBe(true);
  });

  it('applyHooksTuning ignores invalid values, keeping current', () => {
    applyHooksTuning({ timeoutMs: 1500 });
    const config = applyHooksTuning({ timeoutMs: -5 as unknown as number });
    expect(config.hookTuning.timeoutMs.value).toBe(1500);
  });

  it('runHooksInstall rejects an invalid agent', async () => {
    await expect(
      runHooksInstall(dir, { agent: 'bogus' as 'claude', action: 'install' }),
    ).rejects.toThrow(/invalid/i);
  });
});
