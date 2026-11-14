/**
 * Controller Tester and Input Remap layout guarantees: the panels never move or
 * resize when input arrives or side panels open, they scale with --bm-u, and
 * below the floor they fit the viewport and scroll.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';

const TESTER = '.bm-tester-modal.bm-tester-open .bm-tester-panel';
const REMAP = '.bm-debug-modal.bm-debug-open .bm-debug-panel';

/** @param {import('@playwright/test').Page} page */
async function openDemo(page, { connect = true } = {}) {
  const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
  await page.goto('/demo/');
  await page.waitForSelector('#open-btn');
  if (connect) await pad.connect();
  await page.locator('#open-btn').click();
  await expect(page.locator('.bm-modal')).toBeVisible();
  return pad;
}

/** @param {import('@playwright/test').Page} page */
async function openTester(page) {
  await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
  const panel = page.locator(TESTER);
  await expect(panel).toBeVisible();
  return panel;
}

/** Wait until the page has rendered two more animation frames. */
async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

/**
 * Boxes of the panel and every HTML element inside it (SVG internals move on
 * purpose and are left out), keyed by a stable path.
 */
async function layoutSnapshot(page, selector) {
  return page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    const out = {};
    const walk = (el, path) => {
      if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') return;
      const r = el.getBoundingClientRect();
      out[path] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100);
      if (el.tagName.toLowerCase() === 'svg') return;
      [...el.children].forEach((c, i) => walk(c, `${path}>${c.tagName.toLowerCase()}${c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/)[0] : ''}[${i}]`));
    };
    walk(panel, 'panel');
    return out;
  }, selector);
}

function expectSameBox(a, b, label) {
  for (const k of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(a[k] - b[k]), `${label}: ${k} ${a[k]} vs ${b[k]}`).toBeLessThanOrEqual(0.5);
  }
}

function expectSameLayout(ref, snap, label) {
  const moved = Object.keys(ref).filter((k) => !snap[k] || ref[k].some((v, i) => Math.abs(v - snap[k][i]) > 0.5));
  expect(moved, `${label}: elements that moved or resized`).toEqual([]);
}

test.describe('Controller Tester does not jump', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('panel box is identical in every state and across 30 changing frames', async ({ page }) => {
    const pad = await openDemo(page, { connect: false });
    const panel = await openTester(page);
    const ref = await panel.boundingBox();
    expect(ref.width).toBeCloseTo(1400, 0);
    expect(ref.height).toBeCloseTo(800, 0);

    // no pad -> pad idle
    await pad.connect();
    await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
    expectSameBox(await panel.boundingBox(), ref, 'pad idle');
    const idleLayout = await layoutSnapshot(page, TESTER);

    // stick held with two buttons
    await pad.setAxes({ 0: -1, 1: -1 });
    await pad.setButtons({ 0: 1, 5: 1 });
    await expect(panel.locator('[data-code="GP_B0"]')).toHaveClass(/bm-active/);
    expectSameBox(await panel.boundingBox(), ref, 'stick + buttons');
    expectSameLayout(idleLayout, await layoutSnapshot(page, TESTER), 'stick + buttons');

    const toggles = [
      ['debug on', ['.bm-tester-debug-btn']],
      ['editor on', ['.bm-tester-debug-btn', '.bm-tester-editor-btn']],
      ['both on', ['.bm-tester-debug-btn']],
    ];
    for (const [label, clicks] of toggles) {
      for (const c of clicks) await panel.locator(c).click();
      await frames(page);
      expectSameBox(await panel.boundingBox(), ref, label);
    }

    // 30 frames of changing values with both panels open: nothing inside moves
    const bothLayout = await layoutSnapshot(page, TESTER);
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      await pad.setAxes({ 0: Math.sin(i), 1: Math.cos(i), 2: t * 2 - 1, 3: -t });
      await pad.setButtons({ [i % 16]: 1, [(i + 7) % 16]: 0, 6: t, 7: 1 - t });
      await frames(page);
      expectSameBox(await panel.boundingBox(), ref, `frame ${i}`);
      expectSameLayout(bothLayout, await layoutSnapshot(page, TESTER), `frame ${i}`);
    }

    // disconnect again
    await pad.disconnect();
    await frames(page);
    expectSameBox(await panel.boundingBox(), ref, 'disconnected');
  });

  test('Input Remap panel does not move while its live box updates', async ({ page }) => {
    const pad = await openDemo(page);
    await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
    const panel = page.locator(REMAP);
    await expect(panel).toBeVisible();
    const ref = await panel.boundingBox();
    const refLayout = await layoutSnapshot(page, REMAP);

    await panel.locator('.bm-debug-start-btn').click();
    await expect(panel.locator('.bm-debug-capture-btn')).toBeEnabled({ timeout: 6000 });
    expectSameBox(await panel.boundingBox(), ref, 'after baseline');

    let sawSignal = false;
    for (let i = 0; i < 30; i++) {
      await pad.setAxes({ 0: Math.sin(i) * (i % 3 ? 1 : 0.05), 3: (i % 5) / 5 });
      await pad.setButtons({ [i % 12]: i % 2 });
      await frames(page);
      sawSignal ||= (await panel.locator('.bm-debug-live-state').textContent()) === 'Strongest signal';
      expectSameBox(await panel.boundingBox(), ref, `remap frame ${i}`);
      expectSameLayout(refLayout, await layoutSnapshot(page, REMAP), `remap frame ${i}`);
    }
    expect(sawSignal).toBe(true);
    await expect(panel.locator('.bm-debug-live dd[data-field="kind"]')).not.toHaveText('');
  });
});

const SCALE_ELEMENTS = [
  '.bm-tester-panel',
  '.bm-tester-head',
  '.bm-tester-pad',
  '.bm-tester-status',
  '.bm-tester-profile-chip',
  '.bm-tester-profile-select',
  '.bm-tester-debug-btn',
  '.bm-tester-close-btn',
  '.bm-tester-debug',
  '.bm-tester-editor',
  '.bm-tester-signal',
  '.bm-tester-active-codes',
];

/** Boxes of SCALE_ELEMENTS with the tester open, pad connected, both panels on. */
async function scaleBoxes(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await openDemo(page);
  const panel = await openTester(page);
  await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
  await panel.locator('.bm-tester-debug-btn').click();
  await panel.locator('.bm-tester-editor-btn').click();
  await frames(page);
  const boxes = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const r = document.querySelector(`.bm-tester-modal ${s}`).getBoundingClientRect();
    return [s, { x: r.x, y: r.y, width: r.width, height: r.height }];
  })), SCALE_ELEMENTS);
  await page.close();
  return boxes;
}

test.describe('scale invariance', () => {
  test('tester boxes scale with the viewport at 16:9 and stay centred at 21:9', async ({ browser }) => {
    const ref = await scaleBoxes(browser, 1920, 1080);
    const cases = [
      { width: 1280, height: 720, f: 0.6667 },
      { width: 2560, height: 1440, f: 1.3333 },
      { width: 3840, height: 2160, f: 2 },
    ];
    for (const { width, height, f } of cases) {
      const got = await scaleBoxes(browser, width, height);
      for (const s of SCALE_ELEMENTS) {
        for (const k of ['x', 'y', 'width', 'height']) {
          expect(Math.abs(got[s][k] - ref[s][k] * f), `${width}x${height} ${s} ${k}: ${got[s][k]} vs ${ref[s][k] * f}`).toBeLessThanOrEqual(1);
        }
      }
    }
    // 2560x1080: u = 1, same size as 1080p, centred horizontally
    const wide = await scaleBoxes(browser, 2560, 1080);
    const dx = (2560 - 1920) / 2;
    for (const s of SCALE_ELEMENTS) {
      expect(Math.abs(wide[s].width - ref[s].width), `21:9 ${s} width`).toBeLessThanOrEqual(1);
      expect(Math.abs(wide[s].height - ref[s].height), `21:9 ${s} height`).toBeLessThanOrEqual(1);
      expect(Math.abs(wide[s].x - ref[s].x - dx), `21:9 ${s} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(wide[s].y - ref[s].y), `21:9 ${s} y`).toBeLessThanOrEqual(1);
    }
  });
});

for (const vp of [{ width: 1000, height: 600 }, { width: 390, height: 844 }]) {
  test.describe(`below the floor @ ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('tester panel fits the viewport and scrolls', async ({ page }) => {
      await openDemo(page);
      const panel = await openTester(page);
      await panel.locator('.bm-tester-debug-btn').click();
      await panel.locator('.bm-tester-editor-btn').click();
      await frames(page);
      const box = await panel.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      const scrolled = await panel.evaluate((el) => {
        const can = el.scrollHeight > el.clientHeight;
        el.scrollTop = 200;
        return { can, top: el.scrollTop };
      });
      expect(scrolled.can).toBe(true);
      expect(scrolled.top).toBeGreaterThan(0);
      // one column: the side panel sits below the pad
      const pad = await panel.locator('.bm-tester-pad').boundingBox();
      const side = await panel.locator('.bm-tester-debug').boundingBox();
      expect(side.y).toBeGreaterThanOrEqual(pad.y + pad.height - 1);
    });

    test('Input Remap panel fits the viewport and scrolls', async ({ page }) => {
      await openDemo(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
      const panel = page.locator(REMAP);
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      // it scrolls when its content is taller than the viewport (it fits at 390x844)
      expect(await panel.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
      if (vp.height < 720) expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    });
  });
}

test.describe('live controller view', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('fake input lights nodes, moves the stick dot and fills the trigger bars', async ({ page }) => {
    const pad = await openDemo(page);
    const panel = await openTester(page);
    const node = (code) => panel.locator(`.bm-tester-pad [data-code="${code}"]`);
    await expect(node('GP_B0')).not.toHaveClass(/bm-active/);
    const dot = panel.locator('.bm-tester-pad [data-stick="right"] .bm-pad-dot');
    const restDot = await dot.getAttribute('transform');

    await pad.setButtons({ 0: 1, 12: 1, 4: 1 });
    await pad.setAxes({ 2: 1, 3: 0 });
    await pad.setButton(7, 0.75);
    await expect(node('GP_B0')).toHaveClass(/bm-active/);
    await expect(node('GP_B12')).toHaveClass(/bm-active/);
    await expect(node('GP_B4')).toHaveClass(/bm-active/);
    await expect(node('GP_A2P')).toHaveClass(/bm-active/);
    await expect(node('GP_B1')).not.toHaveClass(/bm-active/);
    await expect(node('GP_A2N')).not.toHaveClass(/bm-active/);
    await expect(dot).not.toHaveAttribute('transform', restDot);
    await expect(node('GP_B7').locator('.bm-pad-value')).toHaveText('0.75');
    const fill = Number(await node('GP_B7').locator('.bm-pad-fill').getAttribute('width'));
    expect(fill).toBeGreaterThan(100);

    await pad.reset();
    await expect(node('GP_B0')).not.toHaveClass(/bm-active/);
    await expect(dot).toHaveAttribute('transform', restDot);
    await expect(node('GP_B7').locator('.bm-pad-value')).toHaveText('0.00');
  });

  test('edit mode selects a node and assigns a captured input', async ({ page }) => {
    const pad = await openDemo(page);
    const panel = await openTester(page);
    await panel.locator('.bm-tester-editor-btn').click();
    await panel.locator('.bm-tester-edit-toggle-btn').click();
    await expect(panel.locator('.bm-tester-edit-toggle-btn')).toHaveAttribute('aria-pressed', 'true');

    const target = panel.locator('.bm-tester-pad [data-code="GP_B3"]');
    await target.click();
    await expect(target).toHaveClass(/bm-selected/);
    await expect(panel.locator('.bm-tester-edit-target')).toHaveText('Edit target: GP_B3');

    await pad.setButton(2, 1);
    await expect(panel.locator('.bm-tester-edit-status')).toHaveText(/^Updated GP_B3 → GP_B2/);
    await pad.reset();

    // the remapped profile now drives the pad: physical button 2 lights GP_B3
    await pad.setButton(2, 1);
    await expect(target).toHaveClass(/bm-active/);
  });
});

/** True when the focused element is inside the given selector. */
async function focusInside(page, selector) {
  return page.evaluate((sel) => {
    const box = document.querySelector(sel);
    return !!box && box.contains(document.activeElement);
  }, selector);
}

test.describe('focus management', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('tester traps Tab, returns focus to its footer button on Escape, then Escape closes the bindings modal', async ({ page }) => {
    await openDemo(page);
    const panel = await openTester(page);
    await panel.locator('.bm-tester-editor-btn').click();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(page, TESTER), `Tab ${i}`).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInside(page, TESTER), `Shift+Tab ${i}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-tester-modal')).not.toHaveClass(/bm-tester-open/);
    await expect(page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-modal')).toBeHidden();
  });

  test('after a capture update completes, focus stays in the tester and Escape still closes it', async ({ page }) => {
    const pad = await openDemo(page);
    const panel = await openTester(page);
    await panel.locator('.bm-tester-editor-btn').click();
    await panel.locator('.bm-tester-edit-toggle-btn').click();
    await panel.locator('.bm-tester-pad [data-code="GP_B3"]').click();
    await panel.locator('.bm-tester-capture-update-btn').click();
    const mini = page.locator('.bm-capture-mini-modal.bm-open .bm-capture-mini-panel');
    await expect(mini).toBeVisible({ timeout: 3000 });
    // the mini modal traps Tab too
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(page, '.bm-capture-mini-panel'), `mini Tab ${i}`).toBe(true);
    }
    await pad.setButton(2, 1);
    await expect(mini).toBeHidden({ timeout: 8000 });
    await pad.reset();
    expect(await focusInside(page, TESTER)).toBe(true);
    await expect(panel.locator('.bm-tester-capture-update-btn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-tester-modal')).not.toHaveClass(/bm-tester-open/);
    await expect(page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]')).toBeFocused();
  });

  test('Input Remap: Escape in the mini modal cancels it, focus lands in the tool, Escape closes the tool', async ({ page }) => {
    await openDemo(page);
    await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
    const panel = page.locator(REMAP);
    await expect(panel).toBeVisible();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(page, REMAP), `Tab ${i}`).toBe(true);
    }
    await panel.locator('.bm-debug-start-btn').click();
    await expect(panel.locator('.bm-debug-capture-btn')).toBeEnabled({ timeout: 6000 });
    await panel.locator('.bm-debug-capture-btn').click();
    const mini = page.locator('.bm-capture-mini-modal.bm-open .bm-capture-mini-panel');
    await expect(mini).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mini).toBeHidden();
    await expect(panel).toBeVisible();
    expect(await focusInside(page, REMAP)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-debug-modal')).not.toHaveClass(/bm-debug-open/);
    await expect(page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]')).toBeFocused();
  });
});