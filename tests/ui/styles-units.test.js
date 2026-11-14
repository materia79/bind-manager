import { describe, it, expect } from 'vitest';
import SOURCE from '../../src/ui/styles.js?raw';

// Every length in the stylesheet derives from --bm-u (or a font token) so the
// UI scales with the viewport. Only 1px hairlines and the scale-unit token
// lines in :root may use px.

const CSS = SOURCE.match(/const CSS = `([\s\S]*?)`;/)?.[1] ?? '';

const TOKEN_LINE = /^\s*--bm-(u-min|u-max|u|fs-xs|fs-s|fs-m|fs-l)\s*:/;

const ROOT_TOKEN_LINES = [
  '  --bm-u-min: 0.6667px;',
  '  --bm-u-max: 2px;',
  '  --bm-u: clamp(var(--bm-u-min), min(100vw / 1920, 100vh / 1080), var(--bm-u-max));',
  '  --bm-fs-xs: max(9px, calc(14 * var(--bm-u)));',
  '  --bm-fs-s: max(10px, calc(15 * var(--bm-u)));',
  '  --bm-fs-m: calc(17 * var(--bm-u));',
  '  --bm-fs-l: calc(21 * var(--bm-u));',
];

/** CSS without comments and without the seven token lines, as [lineNumber, text] pairs. */
function checkedLines() {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return withoutComments
    .split('\n')
    .map((text, i) => [i + 1, text])
    .filter(([, text]) => !TOKEN_LINE.test(text));
}

describe('styles.js units', () => {
  it('extracts the stylesheet', () => {
    expect(CSS.length).toBeGreaterThan(1000);
    expect(CSS).toContain('--bm-u: clamp(var(--bm-u-min), min(100vw / 1920, 100vh / 1080), var(--bm-u-max));');
  });

  it('keeps the seven scale-unit token lines in :root byte-identical', () => {
    const root = CSS.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const rootTokens = root.split('\n').filter((line) => TOKEN_LINE.test(line));
    expect(rootTokens).toEqual(ROOT_TOKEN_LINES);
  });

  it('re-declares only the font tokens on the library roots, identical to :root', () => {
    // Re-declared on .bm-overlay, .bm-capture-overlay and .bm-hints so that --bm-u set on any ancestor resizes text too
    const roots = CSS.match(/\n\.bm-overlay,\n\.bm-capture-overlay,\n\.bm-hints \{([\s\S]*?)\}/)?.[1] ?? '';
    const rootTokens = roots.split('\n').filter((line) => TOKEN_LINE.test(line));
    expect(rootTokens).toEqual(ROOT_TOKEN_LINES.slice(3));
    const allTokenLines = CSS.split('\n').filter((line) => TOKEN_LINE.test(line));
    expect(allTokenLines).toHaveLength(7 + 4);
  });

  it('takes the modal size defaults from --bm-u where they are used, not from :root', () => {
    const root = CSS.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(root).not.toMatch(/--bm-modal-(width|max-h|radius):/);
    expect(CSS).toContain('var(--bm-modal-width, calc(1080 * var(--bm-u)))');
    expect(CSS).toContain('var(--bm-modal-max-h, calc(880 * var(--bm-u)))');
  });
  it('uses no px value other than 1px outside the token lines', () => {
    const offenders = [];
    for (const [line, text] of checkedLines()) {
      for (const match of text.matchAll(/(-?\d*\.?\d+)px\b/g)) {
        // 1px hairlines (a -1px shadow offset is the same hairline)
        if (match[1] !== '1' && match[1] !== '-1') offenders.push(`${line}: ${text.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no rem or em lengths', () => {
    const offenders = checkedLines()
      .filter(([, text]) => /\d(r?em)\b/.test(text))
      // letter-spacing in em is relative to the token font size, not a layout length
      .filter(([, text]) => !/^\s*letter-spacing:/.test(text))
      .map(([line, text]) => `${line}: ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  it('sets font sizes through the four tokens only', () => {
    const offenders = [];
    for (const [line, text] of checkedLines()) {
      const match = text.match(/^\s*font-size:\s*([^;]+);/);
      if (match && !/^var\(--bm-fs-(xs|s|m|l)\)$/.test(match[1].trim())) offenders.push(`${line}: ${text.trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('uses no other absolute units', () => {
    const offenders = checkedLines()
      .filter(([, text]) => /\d(pt|pc|cm|mm|in|Q)\b/.test(text))
      .map(([line, text]) => `${line}: ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});
