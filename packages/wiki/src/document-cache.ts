/**
 * Manifest-based conversion cache. Wraps any DocumentConverter and skips
 * re-converting a file whose content (SHA-256) is unchanged, reading the cached
 * plain-text sidecar instead. Sidecars and the manifest live under
 * `.amp/converted/` (gitignored), so converted artifacts never get committed.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ConvertResult, DocumentConverter } from './document-converter.js';

interface ManifestEntry {
  sha: string;
  sidecar: string;
  converter: string;
  converted_at: string;
}
type Manifest = Record<string, ManifestEntry>;

export class CachingDocumentConverter implements DocumentConverter {
  private baseDir: string;
  private manifestPath: string;

  constructor(private inner: DocumentConverter, baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), '.amp', 'converted');
    this.manifestPath = path.join(this.baseDir, 'manifest.json');
  }

  private async loadManifest(): Promise<Manifest> {
    try {
      return JSON.parse(await readFile(this.manifestPath, 'utf-8')) as Manifest;
    } catch {
      return {};
    }
  }

  private async saveManifest(manifest: Manifest): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  async convert(filePath: string): Promise<ConvertResult> {
    const buf = await readFile(filePath);
    const sha = createHash('sha256').update(buf).digest('hex');
    const key = path.resolve(filePath);

    const manifest = await this.loadManifest();
    const entry = manifest[key];
    if (entry && entry.sha === sha) {
      try {
        const text = await readFile(entry.sidecar, 'utf-8');
        return { text, converter: `${entry.converter}+cache` };
      } catch {
        // Sidecar missing — fall through and re-convert.
      }
    }

    const result = await this.inner.convert(filePath);
    await mkdir(this.baseDir, { recursive: true });
    const sidecar = path.join(this.baseDir, `${sha.slice(0, 16)}.txt`);
    await writeFile(sidecar, result.text, 'utf-8');
    manifest[key] = {
      sha,
      sidecar,
      converter: result.converter,
      converted_at: new Date().toISOString(),
    };
    await this.saveManifest(manifest);
    return result;
  }
}
