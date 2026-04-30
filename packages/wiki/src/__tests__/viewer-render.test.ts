// packages/wiki/src/__tests__/viewer-render.test.ts
// Regression test: wikilinks inside markdown table cells must render to clean
// anchor tags whose href is exactly /wiki/<target> with no leaked HTML noise
// like `<td align="right">` from the surrounding table tokenizer.
//
// Original bug: marked v15's pipe-table tokenizer treated the `|` inside
// `[[link|display]]` as a column separator, splitting the wikilink across two
// table cells. resolveWikilinks() was applied to the rendered HTML after marked,
// so by then the wikilink syntax was already destroyed. The fix runs
// resolveWikilinks BEFORE marked.parse() so the `|` inside `[[...|...]]` is
// gone before the table tokenizer sees it.

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../viewer.js';

describe('renderMarkdown — wikilink rendering', () => {
  it('produces clean anchor for [[a/b|c]] (regression: no escaping artifacts in href)', async () => {
    const html = await renderMarkdown('See [[a/b|c]] for details.');
    expect(html).toContain('<a href="/wiki/a/b" class="wikilink">c</a>');
  });

  it('renders wikilinks inside a markdown table without leaking <td> markup into href', async () => {
    // A two-column table where each row has a wikilink in the first cell.
    // Before the fix, marked v15 split [[link|display]] across cells, leaving
    // garbage like `<td align="right">` baked into anchor hrefs.
    const md = [
      '| Project | Notes |',
      '| --- | --- |',
      '| [[projects/oni-core|ONI Core]] | main |',
      '| [[projects/amp|AMP]] | secondary |',
    ].join('\n');

    const html = await renderMarkdown(md);

    // Tables should render normally
    expect(html).toContain('<table>');
    expect(html).toContain('</table>');

    // Anchors should be clean — exact href, no embedded HTML.
    expect(html).toContain('<a href="/wiki/projects/oni-core" class="wikilink">ONI Core</a>');
    expect(html).toContain('<a href="/wiki/projects/amp" class="wikilink">AMP</a>');

    // No leaked table-cell markup inside any anchor href.
    const hrefMatches = [...html.matchAll(/href="([^"]*)"/g)];
    for (const [, href] of hrefMatches) {
      expect(href).not.toContain('<td');
      expect(href).not.toContain('</td');
      expect(href).not.toContain('align=');
      // The wikilink hrefs we emit always start with /wiki/ — make sure none
      // contain stray pipes or angle brackets from a half-tokenized cell.
      if (href.startsWith('/wiki/')) {
        expect(href).not.toMatch(/[<>|]/);
      }
    }
  });

  it('escapes display text but leaves href slug intact', async () => {
    const html = await renderMarkdown('[[a/b|c]]');
    // Exact substring — no double-escaping, no extra attributes.
    expect(html).toContain('<a href="/wiki/a/b" class="wikilink">c</a>');
  });
});
