/**
 * Touch taps on buttons that close a layer (V2): the click a tap produces
 * must never reach what lies under the layer that just closed.
 *
 *   (i)  capture dialog Cancel (gamepad capture) over a bind button
 *   (ii) capture dialog Cancel (keyboard capture) over a bind button
 *   (iii) bindings modal Close (the ✕) over a host page button
 *   (iv) a tool's Close (Controller Test, Input Remap) over the bindings modal
 *
 * Real taps (page.touchscreen.tap) with hasTouch, at 1920x1080 and 1280x720.
 * Self-contained (only the fake gamepad helper), so it also runs on older trees.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad } from './helpers/fake-gamepad.js';

const PAD = Object.freeze({
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
  mapping: 'standard',
  buttonCount: 17,
  axisCount: 4,
});

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];

/** Blank page with a host button (window.__hostClicks) and a manager with 24 actions. */
async function openPage(page) {
  const pad = await installFakeGamepad(page, PAD);
  await page.goto('/package.json');
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; background: #0b1020; }
    #host-btn { position: fixed; left: 0; top: 0; width: 60px; height: 40px; z-index: 1; }
  </style></head><body><button id="host-btn" type="button">host</button></body></html>`);
  await page.evaluate(async () => {
    const { createBindManager } = await import('/src/index.js');
    window.__hostClicks = 0;
    document.getElementById('host-btn').addEventListener('click', () => { window.__hostClicks += 1; });
    const keys = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyA', 'KeyS'];
    window.__bm = createBindManager({ namespace: `touch-${Math.random()}`, builtInTools: true });
    window.__bm.registerActions(Array.from({ length: 24 }, (_, i) => ({
      id: `a${i}`,
      label: `Action ${i + 1}`,
      group: i < 12 ? 'First' : 'Second',
      slots: 2,
      gamepadSlots: 1,
      defaultBindings: [keys[i % keys.length], null],
      defaultGamepadBindings: [`GP_B${i % 16}`],
    })));
  });
  await pad.connect();
  await page.evaluate(() => window.__bm.open());
  await expect(page.locator('.bm-modal')).toBeVisible();
  return pad;
}

const bindings = (page) => page.evaluate(() => JSON.stringify(window.__bm.getBindings()));
const focusWhere = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return 'body';
  if (a.closest('.bm-capture-overlay')) return 'capture';
  if (a.closest('.bm-built-in-tools-root')) return 'tool';
  if (a.closest('.bm-overlay')) return 'bindings';
  return a.id || a.tagName.toLowerCase();
});
const bindingsOpen = (page) => page.locator('.bm-overlay[style*="flex"]');

/**
 * Find a point inside `layerSel` (the button that closes a layer) whose stack
 * of elements contains an element matching `underSel` below the layer;
 * `prepare(x, y)` may scroll something into place first. Returns the point and
 * the found element (tagged data-under="1"), or throws.
 */
async function findPointOver(page, layerSel, underSel, { scrollBody = false } = {}) {
  const result = await page.evaluate(({ layerSel, underSel, scrollBody }) => {
    const btn = document.querySelector(layerSel);
    const r = btn.getBoundingClientRect();
    const points = [];
    for (let fy = 0.5; fy > 0.1; fy -= 0.1) {
      for (let fx = 0.5; fx > 0.1; fx -= 0.1) {
        points.push([r.left + r.width * fx, r.top + r.height * fy], [r.left + r.width * (1 - fx), r.top + r.height * (1 - fy)]);
      }
    }
    const below = (x, y) => document.elementsFromPoint(x, y).find((el) => !btn.contains(el) && el.matches(underSel));
    for (const [x, y] of points) {
      let hit = below(x, y);
      if (!hit && scrollBody) {
        // Scroll the bindings body so a bind button sits under (x, y).
        const body = document.querySelector('.bm-modal-body');
        const centre = (b) => { const br = b.getBoundingClientRect(); return br.top + br.height / 2; };
        const cand = [...document.querySelectorAll('.bm-bind-btn')]
          .filter((b) => { const br = b.getBoundingClientRect(); return br.left + 3 <= x && x <= br.right - 3; })
          .sort((a, b) => Math.abs(centre(a) - y) - Math.abs(centre(b) - y));
        for (const b of cand) {
          body.scrollTop += centre(b) - y;
          hit = below(x, y);
          if (hit) break;
        }
      }
      if (hit) {
        document.querySelectorAll('[data-under]').forEach((el) => el.removeAttribute('data-under'));
        hit.setAttribute('data-under', '1');
        window.__underClicks = 0;
        hit.addEventListener('click', () => { window.__underClicks += 1; });
        return { x, y, under: `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}${hit.dataset.actionId ? `[${hit.dataset.actionId}/${hit.dataset.device}]` : ''}` };
      }
    }
    return null;
  }, { layerSel, underSel, scrollBody });
  if (!result) throw new Error(`no point inside ${layerSel} lies over ${underSel}`);
  return result;
}

for (const size of SIZES) {
  test.describe(`touch: closing a layer by tap @ ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    for (const device of ['gamepad', 'keyboard']) {
      test(`(${device === 'gamepad' ? 'i' : 'ii'}) ${device} capture: Cancel over a bind button`, async ({ page }) => {
        const pad = await openPage(page);
        const slot = page.locator(`.bm-bind-btn[data-action-id="a3"][data-slot="0"][data-device="${device}"]`);
        const sb = await slot.boundingBox();
        await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2);
        await expect(page.locator('.bm-capture-modal')).toBeVisible();

        const point = await findPointOver(page, '.bm-capture-cancel-btn', '.bm-bind-btn', { scrollBody: true });
        test.info().annotations.push({ type: 'under Cancel', description: point.under });
        const before = await bindings(page);
        await page.touchscreen.tap(point.x, point.y);
        await expect(page.locator('.bm-capture-modal')).toBeHidden();
        await page.waitForTimeout(700);

        expect(await page.evaluate(() => window.__underClicks), 'clicks on the bind button under Cancel').toBe(0);
        await expect(page.locator('.bm-capture-modal')).toBeHidden();
        await expect(page.locator('.bm-bind-btn.bm-capturing')).toHaveCount(0);
        expect(await focusWhere(page)).toBe('bindings');

        await page.keyboard.press('KeyZ');
        await pad.setButton(2, 1);
        await page.waitForTimeout(150);
        await pad.setButton(2, 0);
        await page.waitForTimeout(100);
        expect(await bindings(page), 'a later key / pad press binds nothing').toBe(before);

        await page.keyboard.press('Escape');
        await expect(bindingsOpen(page)).toHaveCount(0);
      });
    }

    test('(iii) bindings modal Close over a host page button', async ({ page }) => {
      await openPage(page);
      // Put the host button right under the ✕.
      const close = await page.locator('.bm-close-btn').boundingBox();
      await page.evaluate(({ x, y, w, h }) => {
        Object.assign(document.getElementById('host-btn').style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      }, { x: close.x, y: close.y, w: close.width, h: close.height });
      const point = await findPointOver(page, '.bm-close-btn', '#host-btn');
      const before = await bindings(page);
      await page.touchscreen.tap(point.x, point.y);
      await expect(bindingsOpen(page)).toHaveCount(0);
      await page.waitForTimeout(700);

      expect(await page.evaluate(() => window.__hostClicks), 'clicks on the host button under ✕').toBe(0);
      await expect(page.locator('.bm-capture-modal')).toBeHidden();
      expect(['body', 'host-btn']).toContain(await focusWhere(page));
      await page.keyboard.press('KeyZ');
      expect(await bindings(page)).toBe(before);
      await page.keyboard.press('Escape');
      await expect(bindingsOpen(page)).toHaveCount(0);
    });

    for (const tool of [
      { id: 'controller-test', close: '.bm-tester-close-btn', modal: '.bm-tester-modal.bm-tester-open' },
      { id: 'input-debug', close: '.bm-debug-close-btn', modal: '.bm-debug-modal.bm-debug-open' },
    ]) {
      test(`(iv) ${tool.id} Close over the bindings modal`, async ({ page }) => {
        await openPage(page);
        const footer = page.locator(`.bm-footer-action-btn[data-footer-action-id="${tool.id}"]`);
        const fb = await footer.boundingBox();
        await page.touchscreen.tap(fb.x + fb.width / 2, fb.y + fb.height / 2);
        await expect(page.locator(tool.modal)).toBeVisible();

        // A bindings-modal control under the tool's Close if there is one, else the
        // bindings backdrop (a click on it would close the bindings modal).
        let point;
        try {
          point = await findPointOver(page, tool.close, '.bm-overlay button, .bm-overlay select');
        } catch {
          point = await findPointOver(page, tool.close, '.bm-overlay');
        }
        test.info().annotations.push({ type: 'under Close', description: point.under });
        const before = await bindings(page);
        await page.touchscreen.tap(point.x, point.y);
        await expect(page.locator(tool.modal)).toHaveCount(0);
        await page.waitForTimeout(700);

        expect(await page.evaluate(() => window.__underClicks), 'clicks on the bindings-modal element under Close').toBe(0);
        await expect(bindingsOpen(page)).toHaveCount(1);
        await expect(page.locator('.bm-capture-modal')).toBeHidden();
        await expect(page.locator('.bm-bind-btn.bm-capturing')).toHaveCount(0);
        expect(await focusWhere(page)).toBe('bindings');
        await page.keyboard.press('KeyZ');
        expect(await bindings(page)).toBe(before);
        await page.keyboard.press('Escape');
        await expect(bindingsOpen(page)).toHaveCount(0);
      });
    }
  });
}
