import { describe, it, expect, beforeEach } from 'vitest';
import { createPadView, padSvgOpenTag } from '../../../src/ui/tools/pad-view.js';
import { createDomWriter } from '../../../src/ui/tools/dom-writer.js';
import { STICK_TRAVEL, FACE_GLYPHS, buildPadLayout } from '../../../src/ui/tools/pad-layout.js';
import { labelFor } from './fixtures/family-labels.js';

function makePad(layout = 'symmetric') {
  document.body.innerHTML = `${padSvgOpenTag('bm-tester-pad')}</svg>`;
  const svg = document.querySelector('svg');
  const pad = createPadView(svg, createDomWriter());
  pad.setLayout(layout);
  return { svg, pad };
}

function dotOffset(svg, side, layout) {
  const stick = buildPadLayout(layout).find((e) => e.kind === 'stick' && e.side === side);
  const m = svg.querySelector(`[data-stick="${side}"] .bm-pad-dot`).getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  return Math.hypot(Number(m[1]) - stick.cx, Number(m[2]) - stick.cy);
}

/** Extents of a glyph path built from M/L/H/V/A commands with absolute numbers. */
function pathExtents(d) {
  const xs = [];
  const ys = [];
  const tokens = d.match(/[MLHVAZ]|-?\d+(\.\d+)?/g);
  let cmd = null;
  let args = [];
  const flush = () => {
    if (cmd === 'M' || cmd === 'L') for (let i = 0; i < args.length; i += 2) { xs.push(args[i]); ys.push(args[i + 1]); }
    if (cmd === 'H') xs.push(...args);
    if (cmd === 'V') ys.push(...args);
    if (cmd === 'A') for (let i = 0; i < args.length; i += 7) { xs.push(args[i + 5]); ys.push(args[i + 6]); }
  };
  for (const tok of tokens) {
    if (/[A-Z]/.test(tok)) { flush(); cmd = tok; args = []; } else args.push(Number(tok));
  }
  flush();
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('pad view', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('keeps the stick dot inside a circle at the diagonals', () => {
    const { svg, pad } = makePad('symmetric');
    for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0.9, 0.9]]) {
      pad.setStick('left', x, y);
      expect(dotOffset(svg, 'left', 'symmetric')).toBeLessThanOrEqual(STICK_TRAVEL + 0.15);
    }
    pad.setStick('right', 1, 0);
    expect(dotOffset(svg, 'right', 'symmetric')).toBeCloseTo(STICK_TRAVEL, 0);
    pad.setStick('right', 0.3, 0.4);
    expect(dotOffset(svg, 'right', 'symmetric')).toBeCloseTo(STICK_TRAVEL * 0.5, 0);
  });

  it('draws the PlayStation face symbols as SVG shapes, and letters as text', () => {
    const { svg, pad } = makePad('symmetric');
    pad.setLabels(labelFor('dualsense'), 'dualsense');
    for (const code of ['GP_B0', 'GP_B1', 'GP_B2', 'GP_B3']) {
      const g = svg.querySelector(`[data-code="${code}"]`);
      expect(g.querySelector('.bm-pad-glyph').getAttribute('d'), code).toBeTruthy();
      expect(g.querySelector('.bm-pad-label').textContent, code).toBe('');
    }
    pad.setLayout('offset');
    pad.setLabels(labelFor('xbox'), 'xbox');
    const a = svg.querySelector('[data-code="GP_B0"]');
    expect(a.querySelector('.bm-pad-glyph').getAttribute('d')).toBeNull();
    expect(a.querySelector('.bm-pad-label').textContent).toBe('A');
  });

  it('gives the four face symbols the same size and centre', () => {
    const boxes = Object.values(FACE_GLYPHS).map(pathExtents);
    expect(boxes).toHaveLength(4);
    for (const b of boxes) {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      expect(w).toBeGreaterThanOrEqual(17);
      expect(w).toBeLessThanOrEqual(22);
      expect(h).toBeGreaterThanOrEqual(17);
      expect(h).toBeLessThanOrEqual(22);
      expect(Math.abs(b.minX + b.maxX)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(b.minY + b.maxY)).toBeLessThanOrEqual(2.5);
    }
  });
});
