import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DefaultDocumentConverter,
  needsConversion,
  stripHtml,
  stripRtf,
  type ConvertResult,
  type DocumentConverter,
} from '../document-converter.js';
import { CachingDocumentConverter } from '../document-cache.js';

async function tmpFile(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'amp-doc-'));
  const p = path.join(dir, name);
  await writeFile(p, content, 'utf-8');
  return p;
}

describe('needsConversion', () => {
  it('routes documents through the converter, reads plain text directly', () => {
    expect(needsConversion('notes.pdf')).toBe(true);
    expect(needsConversion('report.DOCX')).toBe(true);
    expect(needsConversion('sheet.xlsx')).toBe(true);
    expect(needsConversion('page.html')).toBe(true);
    expect(needsConversion('memo.rtf')).toBe(true);
    expect(needsConversion('notes.md')).toBe(false);
    expect(needsConversion('data.csv')).toBe(false);
    expect(needsConversion('blob.json')).toBe(false);
    expect(needsConversion('weird.xyz')).toBe(false); // unknown → read as-is
  });
});

describe('stripHtml', () => {
  it('drops scripts/styles, strips tags, decodes entities', () => {
    const html = `<html><head><style>.x{color:red}</style></head>
      <body><h1>Title</h1><script>alert(1)</script>
      <p>Hello &amp; welcome &lt;friend&gt;</p><div>Line</div></body></html>`;
    const text = stripHtml(html);
    expect(text).toContain('Title');
    expect(text).toContain('Hello & welcome <friend>');
    expect(text).toContain('Line');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('color:red');
    // No HTML tags remain (decoded entities like "<friend>" are allowed).
    expect(text).not.toContain('<h1>');
    expect(text).not.toContain('<p>');
    expect(text).not.toContain('<script');
  });
});

describe('stripRtf', () => {
  it('removes control words and unescapes hex', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0 {\fonttbl}\f0\fs24 Hello\par World\'21}`;
    const text = stripRtf(rtf);
    expect(text).toContain('Hello');
    expect(text).toContain('World');
    expect(text).toContain('!'); // \'21 → '!'
    expect(text).not.toContain('\\rtf');
    expect(text).not.toContain('{');
  });
});

describe('DefaultDocumentConverter', () => {
  const conv = new DefaultDocumentConverter();

  it('converts HTML natively', async () => {
    const p = await tmpFile('page.html', '<p>hello <b>world</b></p>');
    const res = await conv.convert(p);
    expect(res.converter).toBe('html-strip');
    expect(res.text).toContain('hello');
    expect(res.text).toContain('world');
  });

  it('reads unknown/plain-text extensions directly', async () => {
    const p = await tmpFile('weird.xyz', 'just text');
    const res = await conv.convert(p);
    expect(res.converter).toBe('plaintext');
    expect(res.text).toBe('just text');
  });

  it('throws an actionable error when a binary tool is unavailable or the file is invalid', async () => {
    const p = await tmpFile('fake.pdf', 'not a real pdf');
    // Whether pdftotext is installed or not, an invalid PDF yields the same
    // graceful, actionable failure (never an uncontrolled crash).
    await expect(conv.convert(p)).rejects.toThrow(/poppler|pdftotext/i);
  });
});

describe('CachingDocumentConverter', () => {
  it('caches by content hash and reuses the sidecar on the second call', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'amp-cache-'));
    const inner = new DefaultDocumentConverter();
    const cache = new CachingDocumentConverter(inner, baseDir);
    const p = await tmpFile('page.html', '<p>cached content</p>');

    const first = await cache.convert(p);
    expect(first.converter).toBe('html-strip'); // freshly converted
    expect(first.text).toContain('cached content');

    const second = await cache.convert(p);
    expect(second.converter).toBe('html-strip+cache'); // served from sidecar
    expect(second.text).toBe(first.text);

    // A sidecar + manifest were written under the base dir.
    const files = await readdir(baseDir);
    expect(files).toContain('manifest.json');
    expect(files.some((f) => f.endsWith('.txt'))).toBe(true);
  });

  it('re-converts when the file content changes (hash miss)', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'amp-cache-'));
    const cache = new CachingDocumentConverter(new DefaultDocumentConverter(), baseDir);
    const p = await tmpFile('page.html', '<p>v1</p>');
    const a = await cache.convert(p);
    expect(a.text).toContain('v1');

    await writeFile(p, '<p>v2 changed</p>', 'utf-8');
    const b = await cache.convert(p);
    expect(b.converter).toBe('html-strip'); // not '+cache'
    expect(b.text).toContain('v2 changed');
  });

  it('falls back to the inner converter when a sidecar goes missing', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'amp-cache-'));
    const stub: DocumentConverter = {
      async convert(): Promise<ConvertResult> {
        return { text: 'stub-text', converter: 'stub' };
      },
    };
    const cache = new CachingDocumentConverter(stub, baseDir);
    const p = await tmpFile('x.html', '<p>x</p>');
    const r = await cache.convert(p);
    expect(r.text).toBe('stub-text');
    // delete sidecars but keep the manifest → next call must re-convert, not crash
    for (const f of await readdir(baseDir)) {
      if (f.endsWith('.txt')) await rm(path.join(baseDir, f));
    }
    const again = await cache.convert(p);
    expect(again.text).toBe('stub-text');
    expect(again.converter).toBe('stub'); // re-converted, not '+cache'
  });
});
