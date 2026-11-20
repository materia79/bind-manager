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

/**
 * Elements checked for scale invariance, per side-panel state. With both panels
 * open the side column scrolls; its scrollbar is sized in --bm-u, so that state
 * scales too.
 */
const DEBUG_ELEMENTS = [
  '.bm-tester-panel',
  '.bm-tester-head',
  '.bm-tester-pad',
  '.bm-tester-status',
  '.bm-tester-profile-chip',
  '.bm-tester-profile-select',
  '.bm-tester-debug-btn',
  '.bm-tester-close-btn',
  '.bm-tester-debug',
  '.bm-tester-signal',
  '.bm-tester-active-codes',
];
const EDITOR_ELEMENTS = ['.bm-tester-editor', '.bm-tester-editor-actions', '.bm-tester-edit-target', '.bm-tester-bindings-section'];
const SCALE_STATES = {
  debug: { toggles: ['.bm-tester-debug-btn'], elements: DEBUG_ELEMENTS },
  editor: { toggles: ['.bm-tester-editor-btn'], elements: EDITOR_ELEMENTS },
  both: { toggles: ['.bm-tester-debug-btn', '.bm-tester-editor-btn'], elements: [...DEBUG_ELEMENTS, ...EDITOR_ELEMENTS, '.bm-tester-side', '.bm-tester-raw'] },
};
const SCALE_ELEMENTS = Object.entries(SCALE_STATES).flatMap(([state, { elements }]) => elements.map((s) => `${state} ${s}`));

/** Boxes of SCALE_ELEMENTS with the tester open and the pad connected. */
async function scaleBoxes(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await openDemo(page);
  const panel = await openTester(page);
  await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
  const boxes = {};
  for (const [state, { toggles, elements }] of Object.entries(SCALE_STATES)) {
    for (const t of toggles) await panel.locator(t).click();
    await frames(page);
    Object.assign(boxes, await page.evaluate(({ list, prefix }) => Object.fromEntries(list.map((s) => {
      const r = document.querySelector(`.bm-tester-modal ${s}`).getBoundingClientRect();
      return [`${prefix} ${s}`, { x: r.x, y: r.y, width: r.width, height: r.height }];
    })), { list: elements, prefix: state }));
    for (const t of toggles) await panel.locator(t).click();
  }
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

/** Input Remap's guided-capture button row, up to its last button (F4). */
const REMAP_ROW = ['.bm-debug-start-btn', '.bm-debug-back-btn', '.bm-debug-redo-btn', '.bm-debug-capture-btn', '.bm-debug-next-btn'];

async function remapRowBoxes(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await openDemo(page);
  await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
  await expect(page.locator(REMAP)).toBeVisible();
  await frames(page);
  const boxes = await page.evaluate((list) => Object.fromEntries(list.map((s) => {
    const r = document.querySelector(`.bm-debug-modal ${s}`).getBoundingClientRect();
    return [s, { x: r.x, y: r.y, width: r.width, height: r.height }];
  })), REMAP_ROW);
  await page.close();
  return boxes;
}

test.describe('scale invariance: Input Remap button row', () => {
  test('every button of the row, up to Next, is a scaled copy (within 1px) and centred at 21:9', async ({ browser }) => {
    const ref = await remapRowBoxes(browser, 1920, 1080);
    for (const { width, height, f } of [
      { width: 1280, height: 720, f: 2 / 3 },
      { width: 2560, height: 1440, f: 4 / 3 },
      { width: 3840, height: 2160, f: 2 },
    ]) {
      const got = await remapRowBoxes(browser, width, height);
      for (const s of REMAP_ROW) {
        for (const k of ['x', 'y', 'width', 'height']) {
          expect(Math.abs(got[s][k] - ref[s][k] * f), `${width}x${height} ${s} ${k}: ${got[s][k]} vs ${ref[s][k] * f}`).toBeLessThanOrEqual(1);
        }
      }
    }
    const wide = await remapRowBoxes(browser, 2560, 1080);
    for (const s of REMAP_ROW) {
      expect(Math.abs(wide[s].x - ref[s].x - 320), `21:9 ${s} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(wide[s].width - ref[s].width), `21:9 ${s} width`).toBeLessThanOrEqual(1);
    }
  });
});

const NO_JUMP_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1000, height: 600 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1366, height: 600 },
];
const LONG_ID = `${'Very Long Vendor Controller Name '.repeat(6)}(STANDARD GAMEPAD Vendor: 1234 Product: 5678)`.slice(0, 200);

/** Boxes of the given selectors (first match each), rounded to 1/100 px. */
async function boxesOf(page, selectors) {
  return page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const el = document.querySelector(s);
    if (!el) return [s, null];
    const r = el.getBoundingClientRect();
    return [s, [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100)];
  })), selectors);
}

function expectSameBoxes(ref, got, label) {
  for (const [s, box] of Object.entries(ref)) {
    expect(got[s], `${label}: ${s} present`).not.toBeNull();
    const diff = box.map((v, i) => Math.abs(v - got[s][i]));
    expect(Math.max(...diff), `${label}: ${s} ${JSON.stringify(box)} vs ${JSON.stringify(got[s])}`).toBeLessThanOrEqual(0.5);
  }
}

const TESTER_FIXED = [
  '.bm-tester-modal .bm-tester-panel',
  '.bm-tester-modal .bm-tester-head',
  '.bm-tester-modal .bm-tester-device',
  '.bm-tester-modal .bm-tester-profile-chip',
  '.bm-tester-modal .bm-tester-profile-select',
  '.bm-tester-modal .bm-tester-close-btn',
  '.bm-tester-modal .bm-tester-body',
];
const REMAP_FIXED = [
  '.bm-debug-modal .bm-debug-panel',
  '.bm-debug-modal .bm-debug-head',
  '.bm-debug-modal .bm-debug-device',
  '.bm-debug-modal .bm-debug-profile-select',
  '.bm-debug-modal .bm-debug-body',
];
const MINI_FIXED = ['.bm-capture-mini-panel', '.bm-capture-mini-panel .bm-tool-head', '.bm-capture-mini-body'];

for (const vp of NO_JUMP_VIEWPORTS) {
  test.describe(`one fixed box in every state @ ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('tester: panel and header never move or resize', async ({ page }) => {
      const pad = await openDemo(page, { connect: false });
      const panel = await openTester(page);
      const ref = await boxesOf(page, TESTER_FIXED);
      const box = ref[TESTER_FIXED[0]];
      expect(box[0]).toBeGreaterThanOrEqual(0);
      expect(box[1]).toBeGreaterThanOrEqual(0);
      expect(box[0] + box[2]).toBeLessThanOrEqual(vp.width);
      expect(box[1] + box[3]).toBeLessThanOrEqual(vp.height);
      const check = async (label) => {
        await frames(page);
        expectSameBoxes(ref, await boxesOf(page, TESTER_FIXED), label);
      };
      await check('no pad');

      await pad.connect();
      await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
      await check('idle');
      await pad.setAxes({ 0: -1, 1: -1 });
      await pad.setButtons({ 0: 1, 5: 1 });
      await expect(panel.locator('[data-code="GP_B0"]')).toHaveClass(/bm-active/);
      await check('stick + 2 buttons');
      await panel.locator('.bm-tester-debug-btn').click();
      await check('debug');
      await panel.locator('.bm-tester-debug-btn').click();
      await panel.locator('.bm-tester-editor-btn').click();
      await check('editor');
      await panel.locator('.bm-tester-debug-btn').click();
      await check('both');
      for (let i = 0; i < 30; i++) {
        await pad.setAxes({ 0: Math.sin(i), 1: Math.cos(i), 2: (i % 7) / 3.5 - 1, 3: -(i % 5) / 5 });
        await pad.setButtons({ [i % 16]: 1, [(i + 7) % 16]: 0, 6: (i % 10) / 10, 7: 1 - (i % 10) / 10 });
        await check(`frame ${i}`);
      }
      await pad.disconnect();
      await check('disconnected');
      await pad.connect();
      await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
      await check('reconnected');
      await pad.disconnect();
      await pad.connect({ id: LONG_ID });
      await expect(panel.locator('.bm-tester-device')).toHaveAttribute('title', new RegExp(`^${LONG_ID.slice(0, 20)}`));
      await check('200-character id');
      await pad.disconnect();
      await pad.connect({ id: 'Big Pad (Vendor: 1111 Product: 2222)', buttonCount: 32, axisCount: 16 });
      await pad.setButtons({ 20: 1, 31: 1 });
      await pad.setAxes({ 12: 1 });
      await expect(panel.locator('.bm-tester-raw-buttons span')).toHaveCount(32);
      await check('32 buttons / 16 axes');
    });

    test('Input Remap and the capture mini modal never move or resize during a guided step', async ({ page }) => {
      const pad = await openDemo(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
      const panel = page.locator(REMAP);
      await expect(panel).toBeVisible();
      const ref = await boxesOf(page, REMAP_FIXED);
      const check = async (label) => {
        await frames(page);
        expectSameBoxes(ref, await boxesOf(page, REMAP_FIXED), label);
      };
      await panel.locator('.bm-debug-start-btn').click();
      await check('normalizing');
      await expect(panel.locator('.bm-debug-capture-btn')).toBeEnabled({ timeout: 6000 });
      await check('baseline captured');
      await pad.setAxes({ 0: -1 });
      await expect(panel.locator('.bm-debug-live-state')).toHaveText('Strongest signal');
      await check('live');
      await pad.reset();
      await panel.locator('.bm-debug-capture-btn').click();
      const mini = page.locator('.bm-capture-mini-modal.bm-open .bm-capture-mini-panel');
      await expect(mini).toBeVisible();
      await check('mini open (remap)');
      const miniRef = await boxesOf(page, MINI_FIXED);
      const mbox = miniRef[MINI_FIXED[0]];
      expect(mbox[0] + mbox[2]).toBeLessThanOrEqual(vp.width);
      expect(mbox[1] + mbox[3]).toBeLessThanOrEqual(vp.height);
      await pad.setButton(0, 1);
      await expect(mini.locator('.bm-capture-mini-live-state')).toHaveText('Strongest signal');
      for (let i = 0; i < 5; i++) {
        await pad.setButton(i % 4, (i % 3) / 2);
        await frames(page);
        expectSameBoxes(miniRef, await boxesOf(page, MINI_FIXED), `mini signal ${i}`);
      }
      await expect(mini).toBeHidden({ timeout: 8000 });
      await check('step captured');
    });
  });
}

for (const vp of [{ width: 1000, height: 600 }, { width: 390, height: 844 }]) {
  test.describe(`below the floor @ ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('tester body scrolls inside the fixed panel, one column, opened sections are scrolled into view', async ({ page }) => {
      await openDemo(page);
      const panel = await openTester(page);
      const ref = await panel.boundingBox();
      const body = panel.locator('.bm-tester-body');
      await panel.locator('.bm-tester-debug-btn').click();
      await frames(page);
      // the opened section is visible inside the body
      const visible = async (sel) => page.evaluate((s) => {
        const b = document.querySelector('.bm-tester-modal .bm-tester-body').getBoundingClientRect();
        const r = document.querySelector(`.bm-tester-modal ${s}`).getBoundingClientRect();
        return r.top < b.bottom - 20 && r.bottom > b.top + 20;
      }, sel);
      expect(await visible('.bm-tester-debug')).toBe(true);
      await panel.locator('.bm-tester-editor-btn').click();
      await frames(page);
      expect(await visible('.bm-tester-editor')).toBe(true);
      expectSameBox(await panel.boundingBox(), ref, 'after toggles');
      expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const pad = await panel.locator('.bm-tester-pad').boundingBox();
      const side = await panel.locator('.bm-tester-debug').boundingBox();
      expect(side.y).toBeGreaterThanOrEqual(pad.y + pad.height - 1);
    });

    test('Input Remap body scrolls inside the fixed panel', async ({ page }) => {
      await openDemo(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
      const panel = page.locator(REMAP);
      await expect(panel).toBeVisible();
      expect(await panel.locator('.bm-debug-body').evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
      // it scrolls when the content is taller than the box (at 390x844 the content fits)
      if (vp.height < 720) expect(await panel.locator('.bm-debug-body').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    });
  });
}

/** Smallest rendered font size (CSS px) of the visible pad labels. */
async function smallestPadLabel(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.bm-tester-modal .bm-tester-pad');
    const scale = svg.getScreenCTM().a;
    let min = Infinity;
    for (const el of svg.querySelectorAll('.bm-pad-label, .bm-pad-value')) {
      if (!el.textContent || el.getClientRects().length === 0) continue;
      min = Math.min(min, Number(el.getAttribute('font-size')) * scale);
    }
    return min;
  });
}

test.describe('pad label legibility', () => {
  test('at least 9 CSS px below the floor (the pad scrolls sideways instead)', async ({ browser }) => {
    for (const vp of [{ width: 390, height: 844 }, { width: 1000, height: 600 }, { width: 820, height: 1180 }]) {
      const page = await browser.newPage({ viewport: vp });
      await openDemo(page);
      const panel = await openTester(page);
      await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
      await panel.locator('.bm-tester-debug-btn').click();
      await frames(page);
      expect(await smallestPadLabel(page), `${vp.width}x${vp.height}`).toBeGreaterThanOrEqual(9);
      await page.close();
    }
  });

  test('at least 10 CSS px at 1280x720 with a side column open', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await openDemo(page);
    const panel = await openTester(page);
    await expect(panel.locator('.bm-tester-profile-select')).toBeEnabled();
    await panel.locator('.bm-tester-debug-btn').click();
    await panel.locator('.bm-tester-editor-btn').click();
    await frames(page);
    expect(await smallestPadLabel(page)).toBeGreaterThanOrEqual(10);
    await page.close();
  });
});

test.describe('bindings list', () => {
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    test(`a binding row is fully visible with both panels open @ ${vp.width}x${vp.height}`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: vp });
      const pad = await openDemo(page);
      const panel = await openTester(page);
      await panel.locator('.bm-tester-debug-btn').click();
      await panel.locator('.bm-tester-editor-btn').click();
      await panel.locator('.bm-tester-edit-toggle-btn').click();
      await panel.locator('.bm-tester-pad [data-code="GP_B3"]').click();
      // assign a binding so the list has a real row (button, index, source)
      await pad.setButton(2, 1);
      await expect(panel.locator('.bm-tester-edit-status')).toHaveText(/^Updated GP_B3/);
      await pad.reset();
      const item = panel.locator('.bm-tester-binding-item').first();
      await expect(item).toBeVisible();
      await item.scrollIntoViewIfNeeded();
      const geo = await item.evaluate((el) => {
        const r = (e) => e.getBoundingClientRect();
        const clipOf = (e) => {
          let box = { top: -Infinity, bottom: Infinity };
          for (let p = e.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(cs.overflowY)) {
              const pr = r(p);
              box = { top: Math.max(box.top, pr.top), bottom: Math.min(box.bottom, pr.bottom) };
            }
          }
          return box;
        };
        const meta = el.querySelector('.bm-tester-binding-meta');
        return { item: r(el), meta: r(meta), clip: clipOf(el) };
      });
      expect(geo.item.top).toBeGreaterThanOrEqual(geo.clip.top - 0.5);
      expect(geo.item.bottom).toBeLessThanOrEqual(geo.clip.bottom + 0.5);
      expect(geo.meta.bottom).toBeLessThanOrEqual(geo.item.bottom + 0.5);
      expect(geo.meta.bottom).toBeLessThanOrEqual(geo.clip.bottom + 0.5);
      await page.close();
    });
  }
});

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