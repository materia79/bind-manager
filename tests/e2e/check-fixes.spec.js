/**
 * Fixes after the independent check of e5186fd, in a real browser: key repeat
 * after the modal closed (M1, L1), focus when the filter hides the focused
 * header (M2), IME composition (M3) and Escape on the clear button (L6).
 * A second page.keyboard.down() of a held key is an auto-repeat keydown.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null], defaultGamepadBindings: ['GP_B0'] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'chat', label: 'Chat', group: 'Social', slots: 1, defaultBindings: ['Enter'] },
  { id: 'pause', label: 'Pause', group: 'System', slots: 1, defaultBindings: ['Escape'] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

async function setup(page, options = {}) {
  await page.goto('/package.json');
  await page.setContent('<!doctype html><html><head></head><body style="margin:0"><button id="host">host</button></body></html>');
  await page.evaluate(async ({ actions, options }) => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace: `check-fixes-e2e-${Math.random()}`, ...options });
    window.__bm = bm;
    window.__events = [];
    bm.registerActions(actions);
    bm.onAnyAction((e) => window.__events.push(`${e.actionId}:${e.type}`));
    bm.open();
  }, { actions: ACTIONS, options });
  await expect(page.locator('.bm-modal')).toBeVisible();
}

const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const events = (page) => page.evaluate(() => window.__events.splice(0));
const isOpen = (page) => page.evaluate(() => window.__bm.isOpen());

test.describe('check fixes', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('M1: Escape held after it closed the modal sends no held', async ({ page }) => {
    await setup(page);
    await page.keyboard.down('Escape');
    expect(await isOpen(page)).toBe(false);
    await frames(page);
    await page.keyboard.down('Escape');
    await page.keyboard.down('Escape');
    await page.keyboard.up('Escape');
    expect(await events(page)).toEqual([]);
    // The game's Escape works on the next real press
    await page.keyboard.press('Escape');
    expect(await events(page)).toEqual(['pause:pressed', 'pause:released']);
  });

  test('L1: Enter held on Close, and W held in the field while Escape closes, send no held', async ({ page }) => {
    await setup(page);
    await page.locator('.bm-close-btn').focus();
    await page.keyboard.down('Enter');
    expect(await isOpen(page)).toBe(false);
    await frames(page);
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    expect(await events(page)).toEqual([]);

    await page.evaluate(() => window.__bm.open());
    await page.locator('.bm-search-input').focus();
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Escape'); // clears the w
    await page.keyboard.press('Escape'); // closes
    expect(await isOpen(page)).toBe(false);
    await frames(page);
    await page.keyboard.down('KeyW');
    await page.keyboard.up('KeyW');
    expect(await events(page)).toEqual([]);
  });

  test('M2: a focused header whose group loses its match keeps the focus; Escape still closes', async ({ page }) => {
    await setup(page);
    await page.locator('.bm-search-input').click();
    await page.keyboard.type('space');
    const header = page.locator('.bm-group-toggle[data-group="Movement"]');
    await header.focus();
    await page.evaluate(() => window.__bm.setBinding('jump', 0, 'KeyJ'));
    await frames(page);
    await expect(header).toBeFocused();
    await expect(header).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.bm-modal'))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await isOpen(page)).toBe(false);
  });

  test('M2: the same after a gamepad profile change', async ({ page }) => {
    const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
    await setup(page);
    await pad.connect();
    await expect(page.locator('.bm-bind-btn[data-action-id="jump"][data-device="gamepad"]')).toHaveText('Cross');
    await page.locator('.bm-search-input').fill('cross');
    const header = page.locator('.bm-group-toggle[data-group="Movement"]');
    await header.focus();
    await page.evaluate(() => window.__bm.setGamepadProfileOverride(0, { type: 'family', family: 'xbox' }));
    await frames(page);
    await expect(header).toBeFocused();
  });

  test('M3: composing keystrokes are typing: no toggle, and a composition-cancelling Escape keeps the text', async ({ page }) => {
    await setup(page, { debug: true, debugKey: 'KeyM' });
    await page.locator('.bm-search-input').click();
    await page.keyboard.type('ju');
    const result = await page.evaluate(() => {
      const input = document.querySelector('.bm-search-input');
      const fire = (code, key) => {
        const event = new KeyboardEvent('keydown', { code, key, keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
        input.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const mPrevented = fire('KeyM', 'Process');
      const escPrevented = fire('Escape', 'Escape');
      return { mPrevented, escPrevented, value: input.value, open: window.__bm.isOpen() };
    });
    expect(result).toEqual({ mPrevented: false, escPrevented: false, value: 'ju', open: true });
  });

  test('L6: Escape on the clear button clears the text and keeps the modal open', async ({ page }) => {
    await setup(page);
    await page.locator('.bm-search-input').click();
    await page.keyboard.type('map');
    await page.keyboard.press('Tab');
    await expect(page.locator('.bm-search-clear')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-search-input')).toHaveValue('');
    await expect(page.locator('.bm-search-input')).toBeFocused();
    expect(await isOpen(page)).toBe(true);
    expect(await events(page)).toEqual([]);
  });
});
