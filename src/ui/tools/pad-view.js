import { _esc } from './esc.js';
import {
  PAD_VIEWBOX,
  PAD_OUTLINE_PATH,
  STICK_TRAVEL,
  FACE_GLYPHS,
  buildPadLayout,
  padLabelText,
  shouldShowPadNode,
  isOptionalPadCode,
  extraRowOffsets,
} from './pad-layout.js';

const TEXT_ATTRS = 'dominant-baseline="central"';

function shapeMarkup(shape, cls = 'bm-pad-shape') {
  if (shape.type === 'circle') return `<circle class="${cls}" cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"/>`;
  return `<rect class="${cls}" x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx ?? 0}"/>`;
}

function labelMarkup(slot, cls = 'bm-pad-label', text = '') {
  return `<text class="${cls}" x="${slot.x}" y="${slot.y}" font-size="${slot.size}" text-anchor="${slot.anchor}" ${TEXT_ATTRS}>${_esc(text)}</text>`;
}

function openNode(code, kind) {
  return `<g class="bm-pad-el bm-pad-${_esc(kind)}" data-code="${_esc(code)}" role="img" aria-label="${_esc(code)}"><title>${_esc(code)}</title>`;
}

function tickPath(cx, cy, r, outer, dir) {
  const near = r + 6;
  const far = r + outer - 2;
  const half = 12;
  const pts = {
    up: [[cx, cy - far], [cx - half, cy - near], [cx + half, cy - near]],
    down: [[cx, cy + far], [cx - half, cy + near], [cx + half, cy + near]],
    left: [[cx - far, cy], [cx - near, cy - half], [cx - near, cy + half]],
    right: [[cx + far, cy], [cx + near, cy - half], [cx + near, cy + half]],
  }[dir];
  return `M ${pts.map((p) => p.join(' ')).join(' L ')} Z`;
}

function tickHit(cx, cy, r, outer, dir) {
  const d = r + outer / 2 + 2;
  const [x, y] = { up: [cx, cy - d], down: [cx, cy + d], left: [cx - d, cy], right: [cx + d, cy] }[dir];
  return `<circle class="bm-pad-hit" cx="${x}" cy="${y}" r="16"/>`;
}

function stickMarkup(el) {
  const { cx, cy, r } = el;
  const ticks = Object.entries(el.dirs).map(([dir, code]) => `${openNode(code, 'tick')}${tickHit(cx, cy, r, el.tickOuter, dir)}<path class="bm-pad-shape" d="${tickPath(cx, cy, r, el.tickOuter, dir)}"/></g>`).join('');
  const dot = `<g class="bm-pad-dot" transform="translate(${cx} ${cy})">${openNode(el.code, 'click')}<circle class="bm-pad-shape" cx="0" cy="0" r="${el.dotR}"/>${labelMarkup({ ...el.label, x: 0, y: 0 })}</g></g>`;
  return `<g class="bm-pad-stick" data-stick="${_esc(el.side)}">`
    + `<circle class="bm-pad-ring" cx="${cx}" cy="${cy}" r="${r}"/>`
    + `<path class="bm-pad-cross" d="M ${cx - r + 8} ${cy} L ${cx + r - 8} ${cy} M ${cx} ${cy - r + 8} L ${cx} ${cy + r - 8}"/>`
    + ticks + dot + '</g>';
}

function triggerMarkup(el) {
  const s = el.shape;
  return openNode(el.code, 'trigger')
    + shapeMarkup(s)
    + `<rect class="bm-pad-fill" x="${s.x + 3}" y="${s.y + 3}" width="0" height="${s.h - 6}" rx="7"/>`
    + labelMarkup(el.label)
    + labelMarkup(el.value, 'bm-pad-value', '0.00')
    + '</g>';
}

/** Inner markup of the pad <svg> for one stick layout (options: see buildPadLayout). */
export function renderPadSvgContent(stickLayout, options = {}) {
  const parts = [
    `<path class="bm-pad-outline" d="${PAD_OUTLINE_PATH}"/>`,
    `<text class="bm-pad-message" x="${PAD_VIEWBOX.width / 2}" y="330" font-size="30" text-anchor="middle" ${TEXT_ATTRS}>Connect a controller and press any button</text>`,
  ];
  for (const el of buildPadLayout(stickLayout, options)) {
    if (el.kind === 'stick') parts.push(stickMarkup(el));
    else if (el.kind === 'trigger') parts.push(triggerMarkup(el));
    else if (el.kind === 'face') parts.push(`${openNode(el.code, el.kind)}${shapeMarkup(el.shape)}<path class="bm-pad-glyph" transform="translate(${el.shape.cx} ${el.shape.cy})"/>${labelMarkup(el.label)}</g>`);
    else parts.push(`${openNode(el.code, el.kind)}${shapeMarkup(el.shape)}${labelMarkup(el.label)}</g>`);
  }
  return parts.join('');
}

/** Opening tag of the pad <svg>; the viewBox never changes, the container scales it. */
export function padSvgOpenTag(className) {
  return `<svg class="${_esc(className)}" viewBox="0 0 ${PAD_VIEWBOX.width} ${PAD_VIEWBOX.height}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Live controller view">`;
}

/**
 * Live controller view on one inline SVG. All per-frame setters write through the
 * given DOM writer, so unchanged values cost no DOM writes.
 * @param {SVGSVGElement} svg
 * @param {ReturnType<import('./dom-writer.js').createDomWriter>} writer
 */
export function createPadView(svg, writer) {
  let stickLayout = null;
  let layoutKey = null;
  let nodes = [];
  let byCode = new Map();
  let sticks = {};
  let triggers = {};

  /**
   * @param {'symmetric' | 'offset'} next
   * @param {{ b17InRow?: boolean }} [options] - GP_B17 in the extra-key row (Elite paddles)
   */
  function setLayout(next, options = {}) {
    const key = `${next}|${options.b17InRow ? 'row' : 'face'}`;
    if (key === layoutKey) return false;
    layoutKey = key;
    stickLayout = next;
    svg.innerHTML = renderPadSvgContent(next, options);
    nodes = [];
    byCode = new Map();
    sticks = {};
    triggers = {};
    const layout = buildPadLayout(next, options);
    const layoutByCode = new Map();
    for (const el of layout) {
      layoutByCode.set(el.code, el);
      if (el.kind === 'stick') for (const code of Object.values(el.dirs)) layoutByCode.set(code, { code, kind: 'tick', label: el.label });
    }
    for (const g of svg.querySelectorAll('[data-code]')) {
      const code = g.getAttribute('data-code');
      const node = {
        code,
        g,
        el: layoutByCode.get(code),
        title: g.querySelector('title'),
        label: g.querySelector('.bm-pad-label'),
        glyph: g.querySelector('.bm-pad-glyph'),
      };
      nodes.push(node);
      byCode.set(code, node);
    }
    for (const el of layout) {
      if (el.kind === 'stick') {
        sticks[el.side] = { cx: el.cx, cy: el.cy, dot: svg.querySelector(`[data-stick="${el.side}"] .bm-pad-dot`) };
      } else if (el.kind === 'trigger') {
        const g = byCode.get(el.code).g;
        triggers[el.side] = { el, g, fill: g.querySelector('.bm-pad-fill'), value: g.querySelector('.bm-pad-value') };
      }
    }
    return true;
  }

  /**
   * Write labels, titles and aria-labels; hide optional nodes without a real
   * label or that the pad does not have (`hasCode` returns false).
   */
  function setLabels(labelFor, family, hasCode = null) {
    for (const node of nodes) {
      const full = labelFor(node.code) || node.code;
      writer.text(node.title, full);
      writer.attr(node.g, 'aria-label', full);
      const shown = shouldShowPadNode(node.code, full) && (!hasCode || !isOptionalPadCode(node.code) || hasCode(node.code));
      writer.attr(node.g, 'display', shown ? null : 'none');
      node.shown = shown;
      if (!node.label || !node.el) continue;
      const text = padLabelText(node.el, full, family);
      const glyph = node.glyph ? FACE_GLYPHS[text] : undefined;
      if (node.glyph) writer.attr(node.glyph, 'd', glyph ?? null);
      writer.text(node.label, glyph ? '' : text);
    }
    // The shown extra keys sit centred under the pad.
    const extras = nodes.filter((n) => n.el?.kind === 'extra');
    const dx = extraRowOffsets(extras.filter((n) => n.shown).map((n) => n.el));
    for (const n of extras) {
      const d = dx.get(n.code) ?? 0;
      writer.attr(n.g, 'transform', d ? `translate(${d} 0)` : null);
    }
  }

  function setActive(activeSet) {
    for (const node of nodes) writer.cls(node.g, 'bm-active', activeSet.has(node.code));
  }

  /** x, y in -1..1 (logical stick axes). */
  function setStick(side, x, y) {
    const s = sticks[side];
    if (!s) return;
    // Clamp to the unit circle so a diagonal never leaves the ring.
    let cx = Math.max(-1, Math.min(1, x || 0));
    let cy = Math.max(-1, Math.min(1, y || 0));
    const mag = Math.hypot(cx, cy);
    if (mag > 1) {
      cx /= mag;
      cy /= mag;
    }
    const qx = Math.round(cx * 100) / 100;
    const qy = Math.round(cy * 100) / 100;
    writer.attr(s.dot, 'transform', `translate(${(s.cx + qx * STICK_TRAVEL).toFixed(1)} ${(s.cy + qy * STICK_TRAVEL).toFixed(1)})`);
  }

  /** value in 0..1. */
  function setTrigger(side, value) {
    const t = triggers[side];
    if (!t) return;
    const q = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
    const s = t.el.shape;
    const width = (s.w - 6) * q;
    writer.attr(t.fill, 'width', width.toFixed(1));
    if (side === 'right') writer.attr(t.fill, 'x', (s.x + s.w - 3 - width).toFixed(1));
    writer.text(t.value, q.toFixed(2));
    writer.cls(t.g, 'bm-analog', q > 0);
  }

  /** Empty state: dimmed outline and a message, no elements, labels or extra keys. */
  function setEmpty(empty) {
    writer.cls(svg, 'bm-pad-empty', empty);
  }

  function setEdit(editMode, selectedCode) {
    writer.cls(svg, 'bm-pad-edit', editMode);
    for (const node of nodes) {
      writer.cls(node.g, 'bm-editable', editMode);
      writer.cls(node.g, 'bm-selected', editMode && node.code === selectedCode);
    }
  }

  function clear() {
    setActive(new Set());
    setStick('left', 0, 0);
    setStick('right', 0, 0);
    setTrigger('left', 0);
    setTrigger('right', 0);
  }

  return {
    setLayout,
    setLabels,
    setActive,
    setStick,
    setTrigger,
    setEdit,
    setEmpty,
    clear,
    getLayout: () => stickLayout,
    getNode: (code) => byCode.get(code)?.g ?? null,
    codes: () => nodes.map((n) => n.code),
  };
}
