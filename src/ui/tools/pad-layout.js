/**
 * Pure layout tables for the live controller view: element geometry in a fixed
 * SVG viewBox, the two stick layouts, per-family label shortening and the box
 * maths the overlap tests use. No DOM access.
 */

export const PAD_VIEWBOX = Object.freeze({ width: 1000, height: 660 });

/** Generic pad outline (not a vendor shape), symmetric around x = 500. */
export const PAD_OUTLINE_PATH = [
  'M 300 104 L 700 104',
  'C 810 104, 872 124, 897 205',
  'C 924 295, 940 430, 912 530',
  'C 892 598, 800 604, 758 556',
  'C 728 522, 690 512, 640 512',
  'L 360 512',
  'C 310 512, 272 522, 242 556',
  'C 200 604, 108 598, 88 530',
  'C 60 430, 76 295, 103 205',
  'C 128 124, 190 104, 300 104 Z',
].join(' ');

export const EXTRA_CODES = Object.freeze(['GP_B18', 'GP_B19', 'GP_B20', 'GP_B21', 'GP_B22', 'GP_B23']);

/** Codes that are drawn only when the active profile gives them a real label. */
const OPTIONAL_CODES = new Set(['GP_B17', ...EXTRA_CODES]);

const SYMMETRIC_FAMILIES = new Set(['dualshock4', 'dualsense']);

/** @returns {'symmetric' | 'offset'} */
export function getStickLayoutForFamily(family) {
  return SYMMETRIC_FAMILIES.has(family) ? 'symmetric' : 'offset';
}

/** Show an optional node (GP_B17..GP_B23) only when its label differs from its code. */
export function shouldShowPadNode(code, label) {
  if (!OPTIONAL_CODES.has(code)) return true;
  return typeof label === 'string' && label !== '' && label !== code;
}

const STICK_RING_R = 60;
const STICK_TICK_OUTER = 24;
const STICK_DOT_R = 24;
/** Maximum dot travel from the ring centre, in viewBox units. */
export const STICK_TRAVEL = STICK_RING_R - STICK_DOT_R - 4;

const FACE_R = 27;
const FACE_OFFSET = 62;
const DPAD_HALF = 22;
const DPAD_INNER = 25;
const DPAD_OUTER = 74;

const LABEL_S = 18;
const LABEL_FACE = 26;
const LABEL_ARROW = 22;

function rect(x, y, w, h, rx) {
  return { type: 'rect', x, y, w, h, rx };
}

function pill(cx, cy, w, h) {
  return rect(cx - w / 2, cy - h / 2, w, h, h / 2);
}

function centredLabel(shape, size, pad = 12) {
  if (shape.type === 'circle') return { x: shape.cx, y: shape.cy, size, anchor: 'middle', maxWidth: shape.r * 2 - pad };
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2, size, anchor: 'middle', maxWidth: shape.w - pad * 2 };
}

function faceButtons(cx, cy) {
  const spots = [
    ['GP_B0', cx, cy + FACE_OFFSET],
    ['GP_B1', cx + FACE_OFFSET, cy],
    ['GP_B2', cx - FACE_OFFSET, cy],
    ['GP_B3', cx, cy - FACE_OFFSET],
  ];
  return spots.map(([code, x, y]) => {
    const shape = { type: 'circle', cx: x, cy: y, r: FACE_R };
    return { code, kind: 'face', shape, label: centredLabel(shape, LABEL_FACE, 8) };
  });
}

function dpad(cx, cy) {
  const len = DPAD_OUTER - DPAD_INNER;
  const w = DPAD_HALF * 2;
  const segs = [
    ['GP_B12', 'up', rect(cx - DPAD_HALF, cy - DPAD_OUTER, w, len, 6)],
    ['GP_B13', 'down', rect(cx - DPAD_HALF, cy + DPAD_INNER, w, len, 6)],
    ['GP_B14', 'left', rect(cx - DPAD_OUTER, cy - DPAD_HALF, len, w, 6)],
    ['GP_B15', 'right', rect(cx + DPAD_INNER, cy - DPAD_HALF, len, w, 6)],
  ];
  return segs.map(([code, dir, shape]) => ({ code, kind: 'dpad', dir, shape, label: centredLabel(shape, LABEL_ARROW, 4) }));
}

function stick(side, cx, cy) {
  const left = side === 'left';
  return {
    code: left ? 'GP_B10' : 'GP_B11',
    kind: 'stick',
    side,
    cx,
    cy,
    r: STICK_RING_R,
    dotR: STICK_DOT_R,
    tickOuter: STICK_TICK_OUTER,
    dirs: left
      ? { left: 'GP_A0N', right: 'GP_A0P', up: 'GP_A1N', down: 'GP_A1P' }
      : { left: 'GP_A2N', right: 'GP_A2P', up: 'GP_A3N', down: 'GP_A3P' },
    shape: { type: 'circle', cx, cy, r: STICK_RING_R + STICK_TICK_OUTER },
    label: { x: cx, y: cy, size: 17, anchor: 'middle', maxWidth: STICK_DOT_R * 2 - 6 },
  };
}

function shoulders() {
  const els = [];
  for (const [side, x] of [['left', 130], ['right', 670]]) {
    const trig = rect(x, 14, 200, 36, 10);
    els.push({
      code: side === 'left' ? 'GP_B6' : 'GP_B7',
      analogCode: side === 'left' ? 'GP_B6A' : 'GP_B7A',
      kind: 'trigger',
      side,
      shape: trig,
      label: { x: x + 14, y: 32, size: LABEL_S, anchor: 'start', maxWidth: 200 - 28 - 52 },
      value: { x: x + 200 - 14, y: 32, size: LABEL_S, anchor: 'end', maxWidth: 52 },
    });
    const bump = rect(x, 60, 200, 38, 19);
    els.push({ code: side === 'left' ? 'GP_B4' : 'GP_B5', kind: 'bumper', shape: bump, label: centredLabel(bump, LABEL_S) });
  }
  return els;
}

function centreEl(code, kind, shape, size = LABEL_S, pad = 10) {
  return { code, kind, shape, label: centredLabel(shape, size, pad) };
}

function extrasRow() {
  const w = 120;
  const gap = 20;
  const total = EXTRA_CODES.length * w + (EXTRA_CODES.length - 1) * gap;
  const x0 = (PAD_VIEWBOX.width - total) / 2;
  return EXTRA_CODES.map((code, i) => centreEl(code, 'extra', rect(x0 + i * (w + gap), 608, w, 36, 8), 17, 8));
}

const LAYOUTS = {
  offset: () => [
    ...shoulders(),
    stick('left', 250, 238),
    ...dpad(372, 400),
    ...faceButtons(750, 230),
    stick('right', 628, 400),
    centreEl('GP_B8', 'center', pill(428, 210, 104, 34)),
    centreEl('GP_B9', 'center', pill(572, 210, 104, 34)),
    centreEl('GP_B16', 'home', pill(500, 140, 96, 40)),
    centreEl('GP_B17', 'center', pill(500, 285, 128, 34)),
    ...extrasRow(),
  ],
  symmetric: () => [
    ...shoulders(),
    ...dpad(250, 238),
    ...faceButtons(750, 238),
    stick('left', 380, 410),
    stick('right', 620, 410),
    centreEl('GP_B17', 'touchpad', rect(400, 120, 200, 96, 14)),
    centreEl('GP_B8', 'center', pill(338, 140, 104, 32)),
    centreEl('GP_B9', 'center', pill(662, 140, 104, 32)),
    centreEl('GP_B16', 'home', pill(500, 280, 96, 40)),
    ...extrasRow(),
  ],
};

/**
 * Element descriptors of a stick layout. Every element has `code`, `kind`, a
 * `shape` (circle or rect in viewBox units) and a `label` slot; sticks also carry
 * their direction codes and the trigger bars their analog code and value slot.
 * @param {'symmetric' | 'offset'} stickLayout
 */
export function buildPadLayout(stickLayout) {
  return (LAYOUTS[stickLayout] ?? LAYOUTS.offset)();
}

// ---- Labels ----------------------------------------------------------------

const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };

/** Per-family label replacements (full label -> short text). */
const FAMILY_SHORT_LABELS = {
  dualshock4: { Cross: '✕', Circle: '○', Square: '□', Triangle: '△' },
  dualsense: { Cross: '✕', Circle: '○', Square: '□', Triangle: '△' },
  'switch-pro': { Minus: '−', Plus: '+' },
  steam: { 'Quick Access': '···', 'Left pad click': 'L Pad', 'Right pad click': 'R Pad' },
};

const DPAD_CODES = { GP_B12: 'up', GP_B13: 'down', GP_B14: 'left', GP_B15: 'right' };
const STICK_DIR_CODE = /^GP_A[0-3][NP]$/;

/**
 * Short text printed on the pad for a code. D-pad segments always show their
 * arrow, stick directions print nothing (the tick shows them), generic "Btn N"
 * becomes "BN"; the full label stays in <title> and aria-label.
 */
export function shortenPadLabel(code, label, family) {
  if (STICK_DIR_CODE.test(code)) return '';
  if (DPAD_CODES[code]) return ARROWS[DPAD_CODES[code]];
  const text = typeof label === 'string' ? label.trim() : '';
  if (!text) return code;
  const familyTable = FAMILY_SHORT_LABELS[family];
  if (familyTable && Object.prototype.hasOwnProperty.call(familyTable, text)) return familyTable[text];
  const btn = text.match(/^Btn\s*(\d+)$/i);
  if (btn) return `B${btn[1]}`;
  return text;
}

const WIDE_GLYPHS = /[←-⇿−─-➿]/;

/** Conservative width estimate of a label in viewBox units. */
export function estimateTextWidth(text, size) {
  let w = 0;
  for (const ch of String(text)) {
    if (ch === ' ') w += 0.32;
    else if (WIDE_GLYPHS.test(ch)) w += 1.0;
    else if (ch === '·') w += 0.4;
    else w += 0.62;
  }
  return w * size;
}

/** Fit a label into maxWidth: keep it, else initials, else truncate with an ellipsis. */
export function fitPadLabel(text, maxWidth, size) {
  if (!text || estimateTextWidth(text, size) <= maxWidth) return text;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const initials = words.map((w) => w[0]).join('').toUpperCase();
    if (estimateTextWidth(initials, size) <= maxWidth) return initials;
  }
  let cut = text;
  while (cut.length > 1 && estimateTextWidth(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Display text for one element given the profile label. */
export function padLabelText(el, label, family) {
  const short = shortenPadLabel(el.code, label, family);
  return fitPadLabel(short, el.label.maxWidth, el.label.size);
}

// ---- Boxes -----------------------------------------------------------------

export function shapeBox(shape) {
  if (shape.type === 'circle') return { x: shape.cx - shape.r, y: shape.cy - shape.r, w: shape.r * 2, h: shape.r * 2 };
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

export function textBox(slot, text) {
  const w = estimateTextWidth(text, slot.size);
  const h = slot.size * 1.2;
  const x = slot.anchor === 'start' ? slot.x : slot.anchor === 'end' ? slot.x - w : slot.x - w / 2;
  return { x, y: slot.y - h / 2, w, h };
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function boxContains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/**
 * Shape and label boxes of every visible element for a layout and label source.
 * @param {'symmetric' | 'offset'} stickLayout
 * @param {string} family
 * @param {(code: string) => string} labelFor
 */
export function computePadBoxes(stickLayout, family, labelFor) {
  const out = [];
  for (const el of buildPadLayout(stickLayout)) {
    const label = labelFor(el.code);
    if (!shouldShowPadNode(el.code, label)) continue;
    const text = padLabelText(el, label, family);
    const entry = { code: el.code, kind: el.kind, text, shape: shapeBox(el.shape), label: text ? textBox(el.label, text) : null, value: null };
    if (el.value) entry.value = textBox(el.value, '0.00');
    out.push(entry);
  }
  return out;
}
