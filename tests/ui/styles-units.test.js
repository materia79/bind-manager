import { describe, it, expect } from 'vitest';
import SOURCE from '../../src/ui/styles.js?raw';

// Every length in the stylesheet derives from --bm-u (or a font token) so the
// UI scales with the viewport. Only 1px hairlines and the scale-unit token
// lines in :root may use px.

const CSS = SOURCE.match(/const CSS = `([\s\S]*?)`;/)?.[1] ?? '';

const TOKEN_LINE = /^\s*--bm-(u-min|u-max|u|fs-xs|fs-s|fs-m|fs-l)\s*:/;

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

  it('keeps exactly the seven scale-unit token lines', () => {
    expect(CSS.split('\n').filter((line) => TOKEN_LINE.test(line))).toHaveLength(7);
  });

  it('uses no px value other than 1px outside the token lines', () => {
    const offenders = [];
    for (const [line, text] of checkedLines()) {
      // The below-the-floor breakpoint is a viewport size, not a length in the layout
      if (/^\s*@media \(max-width: 1279px\), \(max-height: 719px\) \{\s*$/.test(text)) continue;
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
