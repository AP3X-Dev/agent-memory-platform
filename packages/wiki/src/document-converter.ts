/**
 * Dependency-free document → plain-text conversion for ingestion.
 *
 * Text-ish formats (HTML, RTF) are handled natively with no dependencies. Binary
 * office/PDF formats are converted by shelling out to OPTIONAL system tools
 * (pdftotext / pandoc / libreoffice / ssconvert) only if they are installed; if
 * none is available the convert call throws an informative, actionable error and
 * ingestion can skip the file. No npm dependencies and no added security surface.
 *
 * Plain-text formats (.txt/.md/.csv/.json/...) are NOT handled here — they are
 * read directly by the ingestion service. `needsConversion()` reflects that.
 */
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ConvertResult {
  text: string;
  /** Which converter produced the text (e.g. 'html-strip', 'pdftotext'). */
  converter: string;
}

export interface DocumentConverter {
  convert(filePath: string): Promise<ConvertResult>;
}

const HTML_EXTS = new Set(['.html', '.htm', '.xhtml']);
const RTF_EXTS = new Set(['.rtf']);
const PDF_EXTS = new Set(['.pdf']);
const DOC_EXTS = new Set(['.docx', '.doc', '.odt']);
const SHEET_EXTS = new Set(['.xlsx', '.xls', '.ods']);

/** All non-plain-text formats this converter knows how to handle. */
const CONVERTIBLE = new Set<string>([...HTML_EXTS, ...RTF_EXTS, ...PDF_EXTS, ...DOC_EXTS, ...SHEET_EXTS]);

/**
 * True when a file should go through the converter rather than a direct utf-8
 * read. Plain-text and unknown extensions return false (read as-is, preserving
 * the existing behaviour).
 */
export function needsConversion(filePath: string): boolean {
  return CONVERTIBLE.has(extname(filePath).toLowerCase());
}

/** Run a tool and capture stdout; returns null if the tool is missing or fails. */
async function runCapture(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: 20_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = withoutScripts
    .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
  return cleanText(text);
}

export function stripRtf(rtf: string): string {
  const text = rtf
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\\*/g, '');
  return cleanText(text);
}

async function pdfToText(filePath: string): Promise<ConvertResult> {
  const out = await runCapture('pdftotext', ['-q', '-enc', 'UTF-8', filePath, '-']);
  if (out !== null) return { text: cleanText(out), converter: 'pdftotext' };
  throw new Error(
    `No PDF text extractor available for ${filePath}. Install poppler-utils (provides 'pdftotext').`,
  );
}

async function docToText(filePath: string): Promise<ConvertResult> {
  const out = await runCapture('pandoc', [filePath, '-t', 'plain', '--wrap=none']);
  if (out !== null) return { text: cleanText(out), converter: 'pandoc' };
  throw new Error(
    `No document converter available for ${filePath}. Install pandoc (or libreoffice).`,
  );
}

async function sheetToText(filePath: string): Promise<ConvertResult> {
  // gnumeric's ssconvert can stream CSV to stdout.
  const ss = await runCapture('ssconvert', ['-T', 'Gnumeric_stf:stf_csv', filePath, 'fd://1']);
  if (ss !== null) return { text: cleanText(ss), converter: 'ssconvert' };

  // libreoffice converts to a CSV file in a temp dir; read it back.
  let tmp: string | undefined;
  try {
    tmp = await mkdtemp(join(tmpdir(), 'amp-sheet-'));
    const ok = await runCapture('libreoffice', [
      '--headless',
      '--convert-to',
      'csv',
      '--outdir',
      tmp,
      filePath,
    ]);
    if (ok !== null) {
      const files = await readdir(tmp);
      const csv = files.find((f) => f.toLowerCase().endsWith('.csv'));
      if (csv) {
        const text = await readFile(join(tmp, csv), 'utf-8');
        return { text: cleanText(text), converter: 'libreoffice' };
      }
    }
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
  throw new Error(
    `No spreadsheet converter available for ${filePath}. Install gnumeric (ssconvert) or libreoffice.`,
  );
}

export class DefaultDocumentConverter implements DocumentConverter {
  async convert(filePath: string): Promise<ConvertResult> {
    const ext = extname(filePath).toLowerCase();
    if (HTML_EXTS.has(ext)) return { text: stripHtml(await readFile(filePath, 'utf-8')), converter: 'html-strip' };
    if (RTF_EXTS.has(ext)) return { text: stripRtf(await readFile(filePath, 'utf-8')), converter: 'rtf-strip' };
    if (PDF_EXTS.has(ext)) return pdfToText(filePath);
    if (DOC_EXTS.has(ext)) return docToText(filePath);
    if (SHEET_EXTS.has(ext)) return sheetToText(filePath);
    // Not a known convertible format — read as plain text.
    return { text: cleanText(await readFile(filePath, 'utf-8')), converter: 'plaintext' };
  }
}
