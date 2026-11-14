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
    expect(reference['.bm-modal'].width).toBeCloseTo(880, 0);
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
