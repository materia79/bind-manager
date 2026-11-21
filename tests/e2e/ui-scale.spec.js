/**
 * Viewport scaling of the bindings modal, capture modal and hint bar.
 *
 * Every length derives from --bm-u (1px at 1920x1080), so with the same aspect
 * ratio every box is the 1920x1080 box times the scale factor; at a wider
 * aspect ratio boxes keep the reference size and are centred. Below 1280x720
 * the unit sits on its floor and the modal must fit the viewport instead.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';

const REFERENCE = { width: 1920, height: 1080 };
const SCALED = [
  { width: 1280, height: 720, factor: 2 / 3 },
  { width: 2560, height: 1440, factor: 4 / 3 },
  { width: 3840, height: 2160, factor: 2 },
];
const WIDE = { width: 2560, height: 1080 };
const SMALL = [
  { width: 1000, height: 600 },
  { width: 390, height: 844 },
];
const TOLERANCE = 1;

const MODAL_ELEMENTS = [
  '.bm-modal',
  '.bm-modal-header',
  '.bm-modal-title',
  '.bm-close-btn',
  '.bm-search',
  '.bm-search-input',
  '.bm-modal-body',
  '.bm-profile-panel',
  '.bm-profile-name',
  '.bm-profile-chip',
  '.bm-profile-select',
  '.bm-group-title',
  '.bm-action-row',
  '.bm-action-label',
  '.bm-action-desc',
  '.bm-device-badge',
  '.bm-bind-btn',
  '.bm-clear-slot-btn',
  '.bm-bind-btn[data-device="gamepad"]',
  '.bm-action-reset-btn',
  '.bm-modal-footer',
  '.bm-footer-action-btn',
  '.bm-reset-all-btn',
];
const CAPTURE_ELEMENTS = [
  '.bm-capture-modal',
  '.bm-capture-title',
  '.bm-capture-cancel-btn',
  '.bm-capture-message',
  '.bm-capture-detail',
];
const HINT_ELEMENTS = [
  '.bm-hints',
  '.bm-hint-item',
  '.bm-hint-keys',
  '.bm-hint-key',
  '.bm-hint-label',
];

/** Font token per element: [selector, token size in u, px floor]. */
const FONT_CHECKS = [
  ['.bm-modal-title', 21, 0],
  ['.bm-action-label', 17, 0],
  ['.bm-bind-btn', 17, 0],
  ['.bm-reset-all-btn', 17, 0],
  ['.bm-search-input', 17, 0],
  ['.bm-action-desc', 14, 9],
  ['.bm-group-title', 14, 9],
  ['.bm-profile-chip', 14, 9],
  ['.bm-profile-select', 15, 10],
];
const CAPTURE_FONT_CHECKS = [
  ['.bm-capture-title', 21, 0],
  ['.bm-capture-message', 17, 0],
  ['.bm-capture-detail', 15, 10],
];
const HINT_FONT_CHECKS = [
  ['.bm-hint-label', 15, 10],
  ['.bm-hint-key', 14, 9],
];

/** --bm-u for a viewport, as the stylesheet computes it. */
function unitFor({ width, height }) {
  return Math.min(2, Math.max(0.6667, Math.min(width / 1920, height / 1080)));
}

/** @param {import('@playwright/test').Page} page */
async function resize(page, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  // Two frames so layout and media queries have settled
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** @param {import('@playwright/test').Page} page */
function measure(page, selectors) {
  return page.evaluate((list) => Object.fromEntries(list.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return [sel, null];
    const r = el.getBoundingClientRect();
    return [sel, { x: r.x, y: r.y, width: r.width, height: r.height }];
  })), selectors);
}

/** @param {import('@playwright/test').Page} page */
function fontSizes(page, checks) {
  return page.evaluate((list) => Object.fromEntries(list.map(([sel]) => {
    const el = document.querySelector(sel);
    return [sel, el ? parseFloat(getComputedStyle(el).fontSize) : null];
  })), checks);
}

function expectBoxesScaled(actual, reference, factor, label) {
  const errors = [];
  for (const [sel, ref] of Object.entries(reference)) {
    const box = actual[sel];
    expect(ref, `${sel} exists at 1920x1080`).not.toBeNull();
    expect(box, `${sel} exists at ${label}`).not.toBeNull();
    for (const key of ['x', 'y', 'width', 'height']) {
      const expected = ref[key] * factor;
      if (Math.abs(box[key] - expected) > TOLERANCE) {
        errors.push(`${sel}.${key}: ${box[key].toFixed(2)} expected ${expected.toFixed(2)}`);
      }
    }
  }
  expect(errors, `boxes at ${label} = 1920x1080 boxes x ${factor.toFixed(4)}`).toEqual([]);
}

function expectBoxesCentred(actual, reference, viewportWidth, label) {
  const shift = (viewportWidth - REFERENCE.width) / 2;
  const errors = [];
  for (const [sel, ref] of Object.entries(reference)) {
    const box = actual[sel];
    const expected = { x: ref.x + shift, y: ref.y, width: ref.width, height: ref.height };
    for (const key of ['x', 'y', 'width', 'height']) {
      if (Math.abs(box[key] - expected[key]) > TOLERANCE) {
        errors.push(`${sel}.${key}: ${box[key].toFixed(2)} expected ${expected[key].toFixed(2)}`);
      }
    }
  }
  expect(errors, `boxes at ${label} keep the reference size, centred`).toEqual([]);
}

async function expectFontTokens(page, checks, size) {
  const u = unitFor(size);
  const actual = await fontSizes(page, checks);
  const errors = [];
  for (const [sel, n, floor] of checks) {
    const expected = Math.max(floor, n * u);
    if (actual[sel] == null || Math.abs(actual[sel] - expected) > 0.05) {
      errors.push(`${sel}: ${actual[sel]}px expected ${expected.toFixed(3)}px`);
    }
  }
  expect(errors, `font tokens at ${size.width}x${size.height}`).toEqual([]);
}

/**
 * Run the scaling checks for one surface on an already prepared page.
 * @param {import('@playwright/test').Page} page
 */
async function checkScaling(page, selectors, fontChecks) {
  await resize(page, REFERENCE);
  const reference = await measure(page, selectors);
  await expectFontTokens(page, fontChecks, REFERENCE);

  for (const size of SCALED) {
    await resize(page, size);
    expectBoxesScaled(await measure(page, selectors), reference, size.factor, `${size.width}x${size.height}`);
    await expectFontTokens(page, fontChecks, size);
  }

  await resize(page, WIDE);
  expectBoxesCentred(await measure(page, selectors), reference, WIDE.width, `${WIDE.width}x${WIDE.height}`);
  await expectFontTokens(page, fontChecks, WIDE);
}

/** @param {import('@playwright/test').Page} page */
async function openBindings(page) {
  await page.locator('#open-btn').click();
  await expect(page.locator('.bm-modal')).toBeVisible();
  // Keep hover effects out of the measurements
  await page.mouse.move(0, 0);
}

test.describe('UI scale unit', () => {
  test.use({ viewport: REFERENCE });

  test('bindings modal scales with the viewport', async ({ page }) => {
    const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await pad.connect();
    await openBindings(page);
    await expect(page.locator('.bm-profile-chip')).toBeVisible();

    // The demo has more actions than fit: the modal sits at its max height
    const reference = await measure(page, ['.bm-modal']);
    expect(reference['.bm-modal'].width).toBeCloseTo(1080, 0);
    expect(reference['.bm-modal'].height).toBeCloseTo(880, 0);

    await checkScaling(page, MODAL_ELEMENTS, FONT_CHECKS);
  });

  test('capture modal scales with the viewport', async ({ page }) => {
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await openBindings(page);
    await page.locator('.bm-bind-btn').first().click();
    await expect(page.locator('.bm-capture-modal')).toBeVisible();
    await page.mouse.move(0, 0);

    await checkScaling(page, CAPTURE_ELEMENTS, CAPTURE_FONT_CHECKS);
  });

  test('hint bar scales with the viewport', async ({ page }) => {
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await expect(page.locator('.bm-hints')).toBeVisible();

    await checkScaling(page, HINT_ELEMENTS, HINT_FONT_CHECKS);
  });

  for (const size of SMALL) {
    test(`everything fits at ${size.width}x${size.height}`, async ({ page }) => {
      const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
      await page.setViewportSize(size);
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await pad.connect();

      // Hint bar inside the viewport
      const hints = await page.locator('.bm-hints').boundingBox();
      expect(hints.x).toBeGreaterThanOrEqual(0);
      expect(hints.y).toBeGreaterThanOrEqual(0);
      expect(hints.x + hints.width).toBeLessThanOrEqual(size.width);
      expect(hints.y + hints.height).toBeLessThanOrEqual(size.height);

      await openBindings(page);
      const layout = await page.evaluate(() => {
        const box = (sel) => {
          const r = document.querySelector(sel).getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const body = document.querySelector('.bm-modal-body');
        const rows = [...document.querySelectorAll('.bm-action-row')].map((row) => row.scrollWidth - row.clientWidth);
        return {
          modal: box('.bm-modal'),
          footer: box('.bm-modal-footer'),
          resetAll: box('.bm-reset-all-btn'),
          header: box('.bm-modal-header'),
          bodyOverflowY: getComputedStyle(body).overflowY,
          bodyScrollable: body.scrollHeight > body.clientHeight,
          bodyHorizontalOverflow: body.scrollWidth - body.clientWidth,
          rowOverflow: Math.max(...rows),
        };
      });

      for (const part of ['modal', 'header', 'footer', 'resetAll']) {
        const r = layout[part];
        expect(r.left, `${part} left`).toBeGreaterThanOrEqual(0);
        expect(r.top, `${part} top`).toBeGreaterThanOrEqual(0);
        expect(r.right, `${part} right`).toBeLessThanOrEqual(size.width);
        expect(r.bottom, `${part} bottom`).toBeLessThanOrEqual(size.height);
      }
      expect(layout.modal.right - layout.modal.left).toBeLessThanOrEqual(size.width - 16 + 0.5);
      // Content overflows: the body scrolls vertically, nothing is cut off sideways
      expect(layout.bodyOverflowY).toBe('auto');
      expect(layout.bodyScrollable).toBe(true);
      expect(layout.bodyHorizontalOverflow).toBeLessThanOrEqual(0);
      expect(layout.rowOverflow).toBeLessThanOrEqual(0);

      const body = page.locator('.bm-modal-body');
      await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

      // Capture modal fits too
      await page.locator('.bm-bind-btn').first().click();
      const capture = await page.locator('.bm-capture-modal').boundingBox();
      expect(capture.x).toBeGreaterThanOrEqual(0);
      expect(capture.y).toBeGreaterThanOrEqual(0);
      expect(capture.x + capture.width).toBeLessThanOrEqual(size.width);
      expect(capture.y + capture.height).toBeLessThanOrEqual(size.height);
    });
  }
});

// ── Robustness: slot counts, host overrides, focus after mouse cancel ─────────

/**
 * Blank page on the test server with its own manager and the given actions.
 * @param {import('@playwright/test').Page} page
 * @param {{ actions?: object[], hostCss?: string, count?: number, kb?: number, gp?: number, label?: string }} options
 */
async function stressPage(page, { actions, hostCss = '', count = 15, kb = 2, gp = 1, label = 'Action' } = {}) {
  await page.goto('/package.json');
  await page.setContent(`<!doctype html><html><head><style>${hostCss}</style></head><body><button id="opener">Open</button></body></html>`);
  const list = actions ?? Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    label: `${label} ${i + 1}`,
    description: `Description of ${label.toLowerCase()} ${i + 1}`,
    group: i < count / 2 ? 'First' : 'Second',
    slots: kb,
    gamepadSlots: gp,
    defaultBindings: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'].slice(0, kb),
  }));
  await page.evaluate(async (defs) => {
    const { createBindManager } = await import('/src/index.js');
    window.__bm = createBindManager({ namespace: `stress-${Math.random()}` });
    window.__bm.registerActions(defs);
    document.getElementById('opener').addEventListener('click', () => window.__bm.open());
  }, list);
  await page.locator('#opener').click();
  await expect(page.locator('.bm-modal')).toBeVisible();
  await page.mouse.move(0, 0);
  await settle(page);
}

/** @param {import('@playwright/test').Page} page */
async function settle(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Everything in the modal stays inside it horizontally; the body never scrolls sideways. */
async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.bm-modal');
    const body = document.querySelector('.bm-modal-body');
    const m = modal.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const errors = [];
    if (body.scrollWidth > body.clientWidth) errors.push(`body scrolls sideways by ${body.scrollWidth - body.clientWidth}px`);
    for (const el of modal.querySelectorAll('*')) {
      if (el.classList.contains('bm-u-probe')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const inBody = body.contains(el) && el !== body;
      const left = inBody ? b.left : m.left;
      const right = inBody ? b.left + body.clientWidth : m.right;
      if (r.left < left - 0.5 || r.right > right + 0.5) {
        errors.push(`${el.className || el.tagName} [${r.left.toFixed(1)}, ${r.right.toFixed(1)}] outside [${left.toFixed(1)}, ${right.toFixed(1)}]`);
        if (errors.length > 8) break;
      }
    }
    return errors;
  });
}

async function layoutClass(page) {
  return page.evaluate(() => [...document.querySelector('.bm-modal').classList].find((c) => c.startsWith('bm-layout-')) ?? null);
}

/** x of slot n per device for every action row, and whether all rows agree. */
async function slotColumns(page) {
  return page.evaluate(() => {
    const columns = {};
    for (const row of document.querySelectorAll('.bm-action-row')) {
      for (const btn of row.querySelectorAll('.bm-bind-btn')) {
        const key = `${btn.dataset.device}:${btn.dataset.slot}`;
        (columns[key] ??= []).push(Math.round(btn.getBoundingClientRect().left * 100) / 100);
      }
    }
    return columns;
  });
}

function expectAligned(columns) {
  for (const [key, xs] of Object.entries(columns)) {
    expect(Math.max(...xs) - Math.min(...xs), `slot ${key} x across rows: ${xs.join(', ')}`).toBeLessThanOrEqual(0.5);
  }
}

async function expectInViewport(page, selector, size) {
  const r = await page.locator(selector).boundingBox();
  expect(r, `${selector} visible`).not.toBeNull();
  expect(r.x, `${selector} left`).toBeGreaterThanOrEqual(-0.5);
  expect(r.y, `${selector} top`).toBeGreaterThanOrEqual(-0.5);
  expect(r.x + r.width, `${selector} right`).toBeLessThanOrEqual(size.width + 0.5);
  expect(r.y + r.height, `${selector} bottom`).toBeLessThanOrEqual(size.height + 0.5);
}

test.describe('Layout for any slot count (M1)', () => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 3840, height: 2160 }]) {
    test(`3+3 slots stack and fit at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await stressPage(page, { kb: 3, gp: 3 });
      expect(await layoutClass(page)).toBe('bm-layout-stacked');
      expect(await horizontalOverflow(page)).toEqual([]);
      const columns = await slotColumns(page);
      expectAligned(columns);
      // Stacked: the gamepad row sits below the keyboard row with the same columns
      expect(columns['gamepad:0'][0]).toBeCloseTo(columns['keyboard:0'][0], 0);
    });

    test(`2+2 slots stay on one line at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await stressPage(page, { kb: 2, gp: 2 });
      expect(await layoutClass(page)).toBe('bm-layout-inline');
      expect(await horizontalOverflow(page)).toEqual([]);
      const u = size.width / 1920;
      const rowHeight = await page.locator('.bm-action-row').first().evaluate((el) => el.getBoundingClientRect().height);
      expect(rowHeight).toBeLessThanOrEqual(60 * u);
      expectAligned(await slotColumns(page));
    });
  }

  test('no sideways overflow for 1..4 slots per device at 1920x1080, 1280x720 and 390x844', async ({ page }) => {
    test.setTimeout(180000);
    for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      for (let kb = 1; kb <= 4; kb++) {
        for (let gp = 1; gp <= 4; gp++) {
          await stressPage(page, { kb, gp, count: 4, label: 'A rather long action label that has to be ellipsized somewhere' });
          expect(await horizontalOverflow(page), `${kb}+${gp} at ${size.width}x${size.height}`).toEqual([]);
        }
      }
    }
  });

  test('slot columns line up across rows with mixed slot counts (m3)', async ({ page }) => {
    const mixed = (kbMax) => [
      { id: 'a', label: 'One', slots: 1, gamepadSlots: 1 },
      { id: 'b', label: 'Two', slots: kbMax, gamepadSlots: 2 },
      { id: 'c', label: 'Three', slots: 2, gamepadSlots: 1 },
      { id: 'd', label: 'Four', group: 'Other', slots: 1, gamepadSlots: 2 },
    ];
    await page.setViewportSize({ width: 1920, height: 1080 });
    await stressPage(page, { actions: mixed(2) });
    expect(await layoutClass(page)).toBe('bm-layout-inline');
    expectAligned(await slotColumns(page));

    await stressPage(page, { actions: mixed(4) });
    expect(await layoutClass(page)).toBe('bm-layout-stacked');
    const columns = await slotColumns(page);
    expectAligned(columns);
    expect(columns['gamepad:1'][0]).toBeCloseTo(columns['keyboard:1'][0], 0);
  });
});

test.describe('Host overrides (M2, M3, m7)', () => {
  const HOST_WIDTHS = [
    { css: 'body { --bm-modal-width: 660px; --bm-modal-max-h: 80vh; }', sizes: [{ width: 2560, height: 1440 }, { width: 3840, height: 2160 }] },
    { css: 'body { --bm-modal-width: 320px; }', sizes: [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }] },
    { css: 'html:root { --bm-modal-width: 45vw; }', sizes: [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }] },
    { css: 'body { --bm-modal-width: 30em; }', sizes: [{ width: 2560, height: 1440 }] },
  ];
  for (const { css, sizes } of HOST_WIDTHS) {
    for (const size of sizes) {
      test(`content fits a host modal width (${css}) at ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize(size);
        await stressPage(page, { kb: 2, gp: 2, hostCss: css });
        expect(await horizontalOverflow(page)).toEqual([]);
        await expectInViewport(page, '.bm-modal', size);
      });
    }
  }

  for (const css of ['html:root { --bm-u: 1px; }', 'body { --bm-u: 1px; }']) {
    for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }]) {
      test(`${css} keeps everything inside the viewport at ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize(size);
        await stressPage(page, { kb: 2, gp: 1, hostCss: css });
        for (const sel of ['.bm-modal', '.bm-modal-header', '.bm-modal-footer']) await expectInViewport(page, sel, size);
        expect(await horizontalOverflow(page)).toEqual([]);
        // Fixed 1px unit everywhere, fonts included (m7)
        const metrics = await page.evaluate(() => ({
          title: parseFloat(getComputedStyle(document.querySelector('.bm-modal-title')).fontSize),
          label: parseFloat(getComputedStyle(document.querySelector('.bm-action-label')).fontSize),
          bind: document.querySelector('.bm-bind-btn').getBoundingClientRect().width,
        }));
        expect(metrics).toEqual({ title: 21, label: 17, bind: 120 });

        await page.locator('.bm-bind-btn').first().click();
        await expectInViewport(page, '.bm-capture-modal', size);
      });
    }
  }

  test('body { --bm-u: 1px } sizes the modal and the hint bar at 3840x2160 (m7)', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await stressPage(page, { kb: 2, gp: 1, hostCss: 'body { --bm-u: 1px; }' });
    const width = await page.locator('.bm-modal').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeCloseTo(1080, 0);
    await page.evaluate(() => { window.__bm.close(); window.__bm.showAllHints(); });
    const hintFont = await page.locator('.bm-hint-label').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(hintFont).toBe(15);
  });
});

test.describe('Focus and scroll in a real browser', () => {
  test.use({ viewport: REFERENCE });

  test('cancelling a capture with the mouse keeps focus, Escape then closes (M4)', async ({ page }) => {
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await openBindings(page);
    for (const device of ['keyboard', 'gamepad']) {
      await page.locator(`.bm-bind-btn[data-device="${device}"]`).first().click();
      if (device === 'gamepad') {
        // No controller: the modal shows a warning instead of capturing
        await expect(page.locator('.bm-capture-modal')).toBeHidden();
        continue;
      }
      await expect(page.locator('.bm-capture-modal')).toBeVisible();
      await page.locator('.bm-capture-cancel-btn').click();
      await expect(page.locator('.bm-capture-modal')).toBeHidden();
      const where = await page.evaluate(() => ({
        inModal: document.querySelector('.bm-overlay').contains(document.activeElement),
        tag: document.activeElement?.className,
      }));
      expect(where.inModal, `focus on ${where.tag}`).toBe(true);
      // The cancel click must not have been recorded as a mouse binding
      await expect(page.locator('.bm-bind-btn').first()).toHaveText('W');
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-modal')).toBeHidden();
  });

  test('cancelling a gamepad capture with the mouse keeps focus (M4)', async ({ page }) => {
    const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await pad.connect();
    await openBindings(page);
    await page.locator('.bm-bind-btn[data-device="gamepad"]').first().click();
    await expect(page.locator('.bm-capture-modal')).toBeVisible();
    await page.locator('.bm-capture-cancel-btn').click();
    await expect(page.locator('.bm-capture-modal')).toBeHidden();
    expect(await page.evaluate(() => document.querySelector('.bm-overlay').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-modal')).toBeHidden();
  });

  test('reopening restores the body scroll position (m2)', async ({ page }) => {
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await openBindings(page);
    const body = page.locator('.bm-modal-body');
    await body.evaluate((el) => { el.scrollTop = 200; });
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-modal')).toBeHidden();
    await page.locator('#open-btn').click();
    await expect(page.locator('.bm-modal')).toBeVisible();
    expect(await body.evaluate((el) => el.scrollTop)).toBeCloseTo(200, 0);
  });

  test('a long conflict warning is capped at three lines (m5)', async ({ page }) => {
    const actions = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      label: `Conflicting action with a long name number ${i + 1}`,
      slots: 1,
      defaultBindings: [i === 0 ? 'KeyP' : 'KeyQ'],
    }));
    await stressPage(page, { actions });
    await page.locator('.bm-bind-btn[data-action-id="c0"][data-device="keyboard"]').click();
    await page.keyboard.press('q');
    const warning = page.locator('.bm-conflict-warning');
    await expect(warning).toBeVisible();
    const info = await warning.evaluate((el) => ({
      title: el.getAttribute('title'),
      text: el.textContent,
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      footer: document.querySelector('.bm-modal-footer').getBoundingClientRect().height,
    }));
    expect(info.text).toContain('number 12');
    expect(info.title).toBe(info.text);
    expect(info.height).toBeLessThanOrEqual(info.lineHeight * 3 + 13);
    expect(info.footer).toBeLessThanOrEqual(110);
  });
});

// ── Delta 2: touch cancel, layout class, first frame, font overrides, hint pill, chevron ──

/** Text of every bind button, keyed by action/device/slot. */
function bindingTexts(page) {
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bm-bind-btn')]
    .map((b) => [`${b.dataset.actionId}/${b.dataset.device}/${b.dataset.slot}`, b.textContent])));
}

async function captureState(page) {
  return page.evaluate(() => ({
    captureOpen: document.querySelector('.bm-capture-overlay')?.getAttribute('aria-hidden') === 'false',
    capturing: document.querySelectorAll('.bm-capturing').length,
    focusInModal: document.querySelector('.bm-overlay').contains(document.activeElement),
  }));
}

/** Wait long enough for a delayed touch click (and anything it would trigger) to arrive. */
async function quiet(page) {
  await page.waitForTimeout(400);
  await settle(page);
}

/**
 * A point inside the Cancel button with a bind button directly underneath the
 * capture dialog (scrolling the modal body if needed), so a click that leaks
 * through the dialog would start a new capture.
 */
async function pointOverBindButton(page) {
  const point = await page.evaluate(async () => {
    const overlay = document.querySelector('.bm-capture-overlay');
    const cancel = document.querySelector('.bm-capture-cancel-btn').getBoundingClientRect();
    const body = document.querySelector('.bm-modal-body');
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    overlay.style.visibility = 'hidden';
    try {
      for (let scroll = 0; scroll <= body.scrollHeight; scroll += 8) {
        body.scrollTop = scroll;
        await frame();
        for (let y = cancel.top + 3; y < cancel.bottom - 2; y += 3) {
          for (let x = cancel.left + 3; x < cancel.right - 2; x += 3) {
            const el = document.elementFromPoint(x, y);
            if (el?.classList.contains('bm-bind-btn')) return { x, y };
          }
        }
      }
      return null;
    } finally {
      overlay.style.visibility = '';
    }
  });
  expect(point, 'a bind button lies under the Cancel button').not.toBeNull();
  return point;
}

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test.describe(`Cancel by touch never reaches what is underneath @ ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    for (const device of ['gamepad', 'keyboard']) {
      test(`tap Cancel during a ${device} capture`, async ({ page }) => {
        const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
        await stressPage(page, {});
        await pad.connect();
        await settle(page);
        const before = await bindingTexts(page);

        await page.locator(`.bm-bind-btn[data-action-id="a3"][data-device="${device}"][data-slot="0"]`).tap();
        await expect(page.locator('.bm-capture-modal')).toBeVisible();
        const point = await pointOverBindButton(page);
        await page.touchscreen.tap(point.x, point.y);
        await quiet(page);

        expect(await captureState(page)).toEqual({ captureOpen: false, capturing: 0, focusInModal: true });
        await page.keyboard.press('KeyZ');
        await quiet(page);
        expect(await bindingTexts(page)).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(page.locator('.bm-modal')).toBeHidden();
      });
    }

    test('a bind button tapped right after a cancel still starts a capture', async ({ page }) => {
      await stressPage(page, {});
      await page.locator('.bm-bind-btn[data-action-id="a3"][data-device="keyboard"]').first().tap();
      const point = await pointOverBindButton(page);
      await page.touchscreen.tap(point.x, point.y);
      await quiet(page);
      await expect(page.locator('.bm-capture-modal')).toBeHidden();
      await page.locator('.bm-bind-btn[data-action-id="a5"][data-device="keyboard"]').first().tap();
      await expect(page.locator('.bm-capture-modal')).toBeVisible();
      expect((await captureState(page)).capturing).toBe(1);
    });
  });
}

test.describe('Cancel by mouse, then an immediate genuine click', () => {
  test.use({ viewport: REFERENCE });

  test('a bind button clicked right after a mouse cancel starts a capture', async ({ page }) => {
    await stressPage(page, {});
    await page.locator('.bm-bind-btn[data-action-id="a3"][data-device="keyboard"]').first().click();
    await page.locator('.bm-capture-cancel-btn').click();
    await expect(page.locator('.bm-capture-modal')).toBeHidden();
    await page.locator('.bm-bind-btn[data-action-id="a5"][data-device="keyboard"]').first().click();
    await expect(page.locator('.bm-capture-modal')).toBeVisible();
  });

  test('pen-like pointer: Cancel by pointer events is never recorded and starts nothing', async ({ page }) => {
    await stressPage(page, {});
    const before = await bindingTexts(page);
    await page.locator('.bm-bind-btn[data-action-id="a3"][data-device="keyboard"]').first().click();
    const point = await pointOverBindButton(page);
    // Dispatch a pen pointer sequence at Cancel, then the click a pen tap produces at the same point
    await page.evaluate(([x, y]) => {
      const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'pen', isPrimary: true };
      document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', opts));
      document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerup', opts));
      document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
    }, [point.x, point.y]);
    await quiet(page);
    expect(await captureState(page)).toEqual({ captureOpen: false, capturing: 0, focusInModal: true });
    expect(await bindingTexts(page)).toEqual(before);
  });
});

test.describe('Layout class from the measured width (item 3)', () => {
  const CASES = [
    { name: '2+2 at the default width', size: { width: 1920, height: 1080 }, kb: 2, gp: 2, expected: 'bm-layout-inline' },
    { name: '3+3 at the default width', size: { width: 1920, height: 1080 }, kb: 3, gp: 3, expected: 'bm-layout-stacked' },
    { name: '2+2 in a 900px host modal', size: { width: 1920, height: 1080 }, kb: 2, gp: 2, hostCss: 'body { --bm-modal-width: 900px; }', expected: 'bm-layout-stacked' },
    { name: '2+1 in a 660px host modal at 3840x2160', size: { width: 3840, height: 2160 }, kb: 2, gp: 1, hostCss: 'body { --bm-modal-width: 660px; --bm-modal-max-h: 80vh; }', expected: 'bm-layout-narrow' },
    { name: '2+1 at 390x844', size: { width: 390, height: 844 }, kb: 2, gp: 1, expected: 'bm-layout-narrow' },
  ];
  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      await page.setViewportSize(c.size);
      await stressPage(page, { kb: c.kb, gp: c.gp, hostCss: c.hostCss });
      expect(await layoutClass(page)).toBe(c.expected);
    });
  }
});

test.describe('Content-sized host widths are right in the first frame (item 4)', () => {
  for (const width of ['auto', 'fit-content', 'max-content']) {
    for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      test(`--bm-modal-width: ${width} at ${size.width}x${size.height}`, async ({ page }) => {
        await page.setViewportSize(size);
        await stressPage(page, { kb: 2, gp: 2, hostCss: `body { --bm-modal-width: ${width}; }` });
        const result = await page.evaluate(async () => {
          const cls = () => [...document.querySelector('.bm-modal').classList].find((c) => c.startsWith('bm-layout-'));
          window.__bm.close();
          window.__bm.open();
          const changes = [];
          const modal = document.querySelector('.bm-modal');
          const observer = new MutationObserver(() => changes.push(cls()));
          observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
          const atOpen = cls();
          for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
          observer.disconnect();
          return { atOpen, final: cls(), changes };
        });
        expect(result.atOpen).toBe(result.final);
        expect(result.changes).toEqual([]);
        expect(await horizontalOverflow(page)).toEqual([]);
      });
    }
  }
});

test.describe('Host font overrides (item 5)', () => {
  test.use({ viewport: REFERENCE });
  for (const css of ['html:root { --bm-font-m: 24px; --bm-font-l: 30px; }', 'body { --bm-font-m: 24px; --bm-font-l: 30px; }']) {
    test(`${css} sets the body and title text`, async ({ page }) => {
      await stressPage(page, { hostCss: css });
      const sizes = await page.evaluate(() => ({
        label: parseFloat(getComputedStyle(document.querySelector('.bm-action-label')).fontSize),
        bind: parseFloat(getComputedStyle(document.querySelector('.bm-bind-btn')).fontSize),
        title: parseFloat(getComputedStyle(document.querySelector('.bm-modal-title')).fontSize),
        desc: parseFloat(getComputedStyle(document.querySelector('.bm-action-desc')).fontSize),
      }));
      expect(sizes).toEqual({ label: 24, bind: 24, title: 30, desc: 14 });
    });
  }
});

test.describe('Hint pill with long labels (item 6)', () => {
  const LONG = 'A hint label that is far too long to fit on any reasonable screen, eighty chars';
  for (const size of [{ width: 390, height: 844 }, { width: 1000, height: 600 }, { width: 1920, height: 1080 }]) {
    test(`stays inside the viewport and at most three rows at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await stressPage(page, { label: LONG });
      await page.evaluate(() => { window.__bm.close(); window.__bm.showAllHints(); });
      await settle(page);
      const u = unitFor(size);
      const info = await page.evaluate(() => {
        const pill = document.querySelector('.bm-hints').getBoundingClientRect();
        const items = [...document.querySelectorAll('.bm-hint-item')].map((el) => el.getBoundingClientRect())
          .filter((r) => r.top < pill.bottom && r.bottom > pill.top);
        const label = document.querySelector('.bm-hint-label');
        return {
          pill: { left: pill.left, right: pill.right, height: pill.height, bottom: pill.bottom },
          items: items.map((r) => ({ left: r.left, right: r.right })),
          labelWidth: label.getBoundingClientRect().width,
          title: label.getAttribute('title'),
          text: label.textContent,
        };
      });
      expect(info.pill.left).toBeGreaterThanOrEqual(0);
      expect(info.pill.right).toBeLessThanOrEqual(size.width);
      for (const r of info.items) {
        expect(r.left).toBeGreaterThanOrEqual(info.pill.left - 0.5);
        expect(r.right).toBeLessThanOrEqual(info.pill.right + 0.5);
      }
      expect(info.pill.height).toBeLessThanOrEqual(104 * u + 1);
      expect(info.labelWidth).toBeLessThanOrEqual(240 * u + 0.5);
      expect(info.title).toBe(info.text);
    });
  }
});

test.describe('Select chevron (item 7)', () => {
  test('is an SVG drawn at least 8px wide at 1280x720', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
    await stressPage(page, {});
    await pad.connect();
    await expect(page.locator('.bm-profile-select')).toBeVisible();
    const bg = await page.locator('.bm-profile-select').evaluate((el) => {
      const s = getComputedStyle(el);
      return { image: s.backgroundImage, size: s.backgroundSize };
    });
    expect(bg.image).toContain('svg');
    expect(parseFloat(bg.size)).toBeGreaterThanOrEqual(8);
  });
});
