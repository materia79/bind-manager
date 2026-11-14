/**
 * Blank page with its own manager (window.__bm), built-in tools on, one action
 * per gamepad code (id = code, bound to that code) and an event log
 * (window.__bmEvents, "code:type" strings from onAnyAction).
 *
 *   const pad = await installFakeGamepad(page, { id: '...', buttonCount: 18 });
 *   await openHarness(page);
 *   await pad.connect();
 */
import { expect } from '@playwright/test';

const GAMEPAD_CODES = [
  ...Array.from({ length: 24 }, (_, i) => `GP_B${i}`),
  'GP_A0N', 'GP_A0P', 'GP_A1N', 'GP_A1P', 'GP_A2N', 'GP_A2P', 'GP_A3N', 'GP_A3P',
];

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ actions?: 'gamepad' | 'few' }} [options]
 */
export async function openHarness(page, { actions = 'gamepad' } = {}) {
  await page.goto('/package.json');
  await page.setContent('<!doctype html><html><head><style>body { margin: 0; background: #0b1020; }</style></head><body><textarea id="host-text"></textarea></body></html>');
  await page.evaluate(async ({ codes, actions }) => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace: `harness-${Math.random()}`, builtInTools: true });
    window.__bm = bm;
    window.__bmEvents = [];
    const defs = actions === 'gamepad'
      ? codes.map((code) => ({ id: code, label: code, group: 'Gamepad', slots: 1, gamepadSlots: 1, defaultGamepadBindings: [code] }))
      : [
        { id: 'jump', label: 'Jump', group: 'Moves', slots: 1, gamepadSlots: 1, defaultBindings: ['Space'], defaultGamepadBindings: ['GP_B0'] },
        { id: 'fire', label: 'Fire', group: 'Moves', slots: 1, gamepadSlots: 1, defaultBindings: ['KeyF'], defaultGamepadBindings: ['GP_B1'] },
        { id: 'menu', label: 'Menu', group: 'Moves', slots: 1, gamepadSlots: 1, defaultBindings: ['KeyM'], defaultGamepadBindings: ['GP_B9'] },
      ];
    bm.registerActions(defs);
    bm.onAnyAction((e) => {
      if (e.type === 'pressed' || e.type === 'released') window.__bmEvents.push(`${e.code}:${e.type}`);
    });
  }, { codes: GAMEPAD_CODES, actions });
}

/** Wait until the page has rendered `n` more animation frames. */
export async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

/** Open the Controller Tester directly (no bindings modal underneath). */
export async function openTesterDirect(page) {
  await page.evaluate(() => window.__bm.openControllerTest());
  const panel = page.locator('.bm-tester-modal.bm-tester-open .bm-tester-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** True when the tester's pad node for `code` is visible and lit. */
export async function padNodeState(page, code) {
  return page.evaluate((c) => {
    const g = document.querySelector(`.bm-tester-pad [data-code="${c}"]`);
    if (!g) return { exists: false, shown: false, active: false };
    return { exists: true, shown: g.getAttribute('display') !== 'none', active: g.classList.contains('bm-active'), label: g.querySelector('.bm-pad-label')?.textContent ?? null, title: g.querySelector('title')?.textContent ?? null };
  }, code);
}

/** Drain the event log. */
export async function takeEvents(page) {
  return page.evaluate(() => window.__bmEvents.splice(0));
}
