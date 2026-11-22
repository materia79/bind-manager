/**
 * 0.2.2: the search field of the bindings modal in a real browser. Keys are
 * typed with page.keyboard, so they go through the browser like a player's.
 * The binds are game-like: plain letters, Enter, Tab and Escape are actions.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null], defaultGamepadBindings: ['GP_B0'] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'save', label: 'Quick Save', description: 'Saves the game', group: 'System', slots: 2, defaultBindings: ['ControlLeft+KeyS', null] },
  { id: 'zoom', label: 'Zoom In', group: 'Camera', slots: 2, defaultBindings: ['MouseWheelUp', null] },
  { id: 'chat', label: 'Chat', group: 'Social', slots: 1, defaultBindings: ['Enter'] },
  { id: 'cycle', label: 'Cycle Target', group: 'Combat', slots: 1, defaultBindings: ['Tab'] },
  { id: 'pause', label: 'Pause', group: 'System', slots: 1, defaultBindings: ['Escape'] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
  { id: 'attack', label: 'Attack', group: 'Combat', slots: 1, defaultBindings: ['KeyA'] },
  // Enough rows that the body scrolls at every size
  ...Array.from({ length: 30 }, (_, i) => ({ id: `spell-${i}`, label: `Spell ${i + 1}`, group: 'Spells', slots: 1, defaultBindings: [null] })),
];

async function setup(page, options = {}) {
  await page.goto('/package.json');
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#0b1020"></body></html>');
  await page.evaluate(async ({ actions, options }) => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace: `bind-search-e2e-${Math.random()}`, ...options });
    window.__bm = bm;
    window.__events = [];
    bm.registerActions(actions);
    bm.onAnyAction((e) => window.__events.push(`${e.actionId}:${e.type}`));
    bm.open();
  }, { actions: ACTIONS, options });
  await expect(page.locator('.bm-modal')).toBeVisible();
}

const visibleRows = (page) => page.evaluate(() => [...document.querySelectorAll('.bm-action-row')]
  .filter((row) => row.offsetParent !== null).map((row) => row.dataset.actionId));

test.describe('bind search', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('typing bound letters, Enter, Tab and Escape fires no action and records nothing; Tab moves focus', async ({ page }) => {
    await setup(page, { debug: true });
    const field = page.locator('.bm-search-input');
    await field.click();
    await page.keyboard.type('map');
    await expect(field).toHaveValue('map');
    expect(await visibleRows(page)).toEqual(['map']);
    await page.keyboard.press('Enter');
    await expect(field).toHaveValue('map');
    await page.keyboard.type(' a');
    await expect(field).toHaveValue('map a');
    // Tab leaves the field for the next control (the clear button), inside the modal
    await page.keyboard.press('Tab');
    await expect(page.locator('.bm-search-clear')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(field).toBeFocused();
    // Escape clears, the modal stays; the next Escape closes
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    expect(await page.evaluate(() => window.__bm.isOpen())).toBe(true);
    expect(await page.evaluate(() => window.__events)).toEqual([]);
    expect(await page.locator('.bm-capturing').count()).toBe(0);
    expect(await page.evaluate(() => window.__bm.getBinding('map'))).toEqual(['KeyM']);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.__bm.isOpen())).toBe(false);
    expect(await page.evaluate(() => window.__events)).toEqual([]);
  });

  test('a letter debug key types into the field', async ({ page }) => {
    await setup(page, { debug: true, debugKey: 'KeyK' });
    await page.locator('.bm-search-input').click();
    await page.keyboard.type('kk');
    await expect(page.locator('.bm-search-input')).toHaveValue('kk');
    expect(await page.evaluate(() => window.__bm.isOpen())).toBe(true);
  });

  test('matches binding labels: a key, a modifier, the wheel and the pad profile name', async ({ page }) => {
    const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
    await setup(page);
    await pad.connect();
    await expect(page.locator('.bm-bind-btn[data-action-id="jump"][data-device="gamepad"]')).toHaveText('Cross');
    const field = page.locator('.bm-search-input');
    for (const [text, rows] of [['space', ['jump']], ['ctrl', ['save']], ['wheel up', ['zoom']], ['cross', ['jump']], ['GP_B0', []]]) {
      await field.fill(text);
      expect(await visibleRows(page), text).toEqual(rows);
    }
    await expect(page.locator('.bm-search-empty')).toHaveText('No key bindings match "GP_B0".');
    await expect(page.locator('.bm-search-status')).toHaveText('No key bindings match.');
  });

  test('hidden rows and groups leave the Tab order; the trap wraps over visible controls only', async ({ page }) => {
    await setup(page);
    const field = page.locator('.bm-search-input');
    await field.click();
    await page.keyboard.type('pause');
    const order = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => {
        const el = document.activeElement;
        return `${el.className.split(' ')[0]}${el.dataset.actionId ? `:${el.dataset.actionId}` : ''}`;
      }));
    }
    const rows = order.filter((entry) => entry.includes(':')).map((entry) => entry.split(':')[1]);
    expect(new Set(rows)).toEqual(new Set(['pause']));
    // The trap wrapped: the close button and the field come round again
    expect(order).toContain('bm-close-btn');
    expect(order.filter((entry) => entry === 'bm-search-input').length).toBeGreaterThanOrEqual(1);
    const groups = await page.evaluate(() => [...document.querySelectorAll('.bm-group')].filter((g) => g.offsetParent !== null).length);
    expect(groups).toBe(1);
  });

  test('the field stays in place while the list scrolls, and fits every row layout', async ({ page }) => {
    for (const [size, layout] of [[{ width: 1920, height: 1080 }, 'bm-layout-inline'], [{ width: 520, height: 900 }, 'bm-layout-stacked'], [{ width: 390, height: 844 }, 'bm-layout-narrow']]) {
      await page.setViewportSize(size);
      await setup(page, { builtInTools: true });
      await expect(page.locator('.bm-modal')).toHaveClass(new RegExp(layout));
      const before = await page.locator('.bm-search-input').boundingBox();
      await page.locator('.bm-modal-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
      const after = await page.locator('.bm-search-input').boundingBox();
      expect(after.y, layout).toBeCloseTo(before.y, 0);
      const geometry = await page.evaluate(() => {
        const modal = document.querySelector('.bm-modal').getBoundingClientRect();
        const header = document.querySelector('.bm-modal-header').getBoundingClientRect();
        const row = document.querySelector('.bm-search').getBoundingClientRect();
        const field = document.querySelector('.bm-search-input').getBoundingClientRect();
        const body = document.querySelector('.bm-modal-body').getBoundingClientRect();
        return { modal, header, row, field, body, overflow: document.querySelector('.bm-search').scrollWidth - document.querySelector('.bm-search').clientWidth };
      });
      expect(geometry.row.top, layout).toBeCloseTo(geometry.header.bottom, 0);
      expect(geometry.body.top, layout).toBeCloseTo(geometry.row.bottom, 0);
      expect(geometry.field.left, layout).toBeGreaterThanOrEqual(geometry.modal.left);
      expect(geometry.field.right, layout).toBeLessThanOrEqual(geometry.modal.right);
      expect(geometry.overflow, layout).toBeLessThanOrEqual(0);
      // In --bm-u: the row is 12u + 36u + 12u high
      const u = await page.evaluate(() => document.querySelector('.bm-u-probe').getBoundingClientRect().width / 1000);
      expect(geometry.row.height, layout).toBeCloseTo(60 * u, 0);
    }
  });

  test('the clear button appears with text, empties the field and keeps the focus in it', async ({ page }) => {
    await setup(page);
    const clear = page.locator('.bm-search-clear');
    await expect(clear).toBeHidden();
    await page.locator('.bm-search-input').fill('jump');
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(page.locator('.bm-search-input')).toHaveValue('');
    await expect(page.locator('.bm-search-input')).toBeFocused();
    await expect(clear).toBeHidden();
    expect((await visibleRows(page)).length).toBe(ACTIONS.length);
  });

  test('scrolls the filtered list to its top, and clearing returns to the position before the search', async ({ page }) => {
    await setup(page);
    const body = page.locator('.bm-modal-body');
    await body.evaluate((el) => { el.scrollTop = 600; });
    const start = await body.evaluate((el) => el.scrollTop);
    expect(start).toBeGreaterThan(0);
    await page.locator('.bm-search-input').click();
    await page.keyboard.type('spell');
    expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
    await page.keyboard.press('Escape');
    expect(await body.evaluate((el) => el.scrollTop)).toBe(start);
  });

  test('bindSearch: false renders no search', async ({ page }) => {
    await setup(page, { bindSearch: false });
    expect(await page.locator('.bm-search, .bm-search-input, .bm-search-empty').count()).toBe(0);
  });
});

test.describe('bind search on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('16px text on the field (no focus zoom), and the list stays usable with an on-screen keyboard', async ({ page }) => {
    await setup(page);
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
    const field = page.locator('.bm-search-input');
    const fontSize = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    // Also with the smallest scale unit a host can set
    await page.evaluate(() => document.documentElement.style.setProperty('--bm-u', '0.5px'));
    expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.evaluate(() => document.documentElement.style.removeProperty('--bm-u'));

    await field.tap();
    await expect(field).toBeFocused();
    await page.keyboard.type('spell');
    // Stand-in for the on-screen keyboard: a much shorter viewport (what Android does with resizes-content)
    for (const height of [400, 300]) {
      await page.setViewportSize({ width: 390, height });
      const state = await page.evaluate(() => {
        const field = document.querySelector('.bm-search-input').getBoundingClientRect();
        const body = document.querySelector('.bm-modal-body');
        const before = body.scrollTop;
        body.scrollTop = 200;
        const scrolled = body.scrollTop;
        body.scrollTop = before;
        return { fieldTop: field.top, fieldBottom: field.bottom, viewport: innerHeight, bodyHeight: body.clientHeight, scrollable: body.scrollHeight > body.clientHeight, scrolled };
      });
      expect(state.fieldTop, `height ${height}`).toBeGreaterThanOrEqual(0);
      expect(state.fieldBottom, `height ${height}`).toBeLessThanOrEqual(state.viewport);
      expect(state.bodyHeight, `height ${height}`).toBeGreaterThan(50);
      expect(state.scrollable, `height ${height}`).toBe(true);
      expect(state.scrolled, `height ${height}`).toBeGreaterThan(0);
    }
    // Touch on the clear button
    await page.locator('.bm-search-clear').tap();
    await expect(field).toHaveValue('');
  });
});
