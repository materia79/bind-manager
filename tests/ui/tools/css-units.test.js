import { describe, it, expect } from 'vitest';
import { BUILT_IN_TOOLS_CSS, TOOL_PANEL_SIZES } from '../../../src/ui/tools/tools-css.js';

/**
 * Every length in the tools CSS must be calc(N * var(--bm-u)) or a font token.
 * Allowed exceptions: 1px hairlines, media query conditions, and the agreed
 * below-the-floor limits calc(100vw - 16px) / calc(100vh - 16px).
 */
function stripAllowed(css) {
  return css
    .replace(/@media[^{]*\{/g, '@media {')
    .replace(/calc\(100v[wh] - 16px\)/g, 'ALLOWED');
}

describe('built-in tools CSS units', () => {
  const css = stripAllowed(BUILT_IN_TOOLS_CSS);

  it('uses no px length other than 1px', () => {
    const offenders = [...css.matchAll(/(?<![\w.-])(\d*\.?\d+)px\b/g)]
      .map((m) => m[0])
      .filter((v) => v !== '1px');
    expect(offenders).toEqual([]);
  });

  it('uses no rem or em lengths', () => {
    expect([...css.matchAll(/(?<![\w.-])\d*\.?\d+r?em\b/g)].map((m) => m[0])).toEqual([]);
  });

  it('expresses lengths through the scale unit', () => {
    expect(BUILT_IN_TOOLS_CSS).toContain('var(--bm-u)');
    expect(BUILT_IN_TOOLS_CSS).toMatch(/\.bm-tester-panel \{ width: calc\(1400 \* var\(--bm-u\)\); height: calc\(800 \* var\(--bm-u\)\); \}/);
    expect(TOOL_PANEL_SIZES.tester).toEqual({ width: 1400, height: 800 });
  });

  it('the scanner catches violations', () => {
    expect(stripAllowed('a { width: 12px; }').match(/(?<![\w.-])(\d*\.?\d+)px\b/)).not.toBeNull();
    expect(stripAllowed('a { gap: 0.5rem; margin: 2em; }').match(/(?<![\w.-])\d*\.?\d+r?em\b/g)).toHaveLength(2);
    expect(stripAllowed('@media (max-width: 1279px) { a { border: 1px solid; } }').match(/(?<![\w.-])(\d*\.?\d+)px\b/g)).toEqual(['1px']);
  });
});
