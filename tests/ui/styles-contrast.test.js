import { describe, it, expect } from 'vitest';
import SOURCE from '../../src/ui/styles.js?raw';

// WCAG 2 contrast of the default text colours against the default backgrounds
// they are drawn on. Small text needs at least 4.5:1.

// Line-ending independent: a Windows checkout (core.autocrlf) has CRLF in styles.js
const CSS = (SOURCE.match(/const CSS = `([\s\S]*?)`;/)?.[1] ?? '').replace(/\r\n?/g, '\n');
const ROOT = CSS.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';

function rootColour(name) {
  const match = ROOT.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`--${name} is not a #rrggbb colour in :root`);
  return match[1];
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ['bm-text-primary', 'bm-text-secondary', 'bm-text-desc'];
// Modal, profile line, hovered row, and buttons (the × clear button sits on a hovered row or a button)
const BACKGROUNDS = ['bm-modal-bg', 'bm-group-bg', 'bm-row-hover', 'bm-btn-bg'];

describe('default colour contrast', () => {
  it('computes the WCAG reference values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  for (const text of TEXT) {
    for (const bg of BACKGROUNDS) {
      it(`--${text} on --${bg} is at least 4.5:1`, () => {
        expect(contrast(rootColour(text), rootColour(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('draws the × clear button and descriptions in a text colour that passes', () => {
    const rule = (selector) => CSS.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')} \\{([\\s\\S]*?)\\}`))?.[1] ?? '';
    for (const selector of ['.bm-clear-slot-btn', '.bm-action-desc']) {
      expect(rule(selector), selector).toMatch(/\bcolor:\s*var\(--bm-text-(secondary|desc|primary)\)/);
    }
  });
});
