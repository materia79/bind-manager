/**
 * 0.2.3: modifier-only chords with real key events in Chromium, recorded in the
 * rebind dialog and fired in gameplay; and the focus fixes N1 and N2 of the
 * 0.2.2 check. A second page.keyboard.down() of a held key is an auto-repeat
 * keydown.
 */
import { test, expect } from '@playwright/test';

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null] },
  { id: 'crouch', label: 'Crouch', group: 'Movement', slots: 1, defaultBindings: ['ControlLeft'] },
  { id: 'names', label: 'Show Names', group: 'Interface', slots: 2, defaultBindings: ['ControlLeft+ShiftLeft', null] },
  { id: 'select-all', label: 'Select All', group: 'Interface', slots: 1, defaultBindings: ['ControlLeft+ShiftLeft+KeyA'] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

async function setup(page, { open = false } = {}) {
  await page.goto('/package.json');
  await page.setContent('<!doctype html><html><head></head><body style="margin:0"><button id="host">host</button></body></html>');
  await page.evaluate(async ({ actions, open }) => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace: `chords-e2e-${Math.random()}` });
    window.__bm = bm;
    window.__events = [];
    bm.registerActions(actions);
    bm.onAnyAction((e) => window.__events.push(`${e.actionId}:${e.type}:${e.code}`));
    if (open) bm.open();
  }, { actions: ACTIONS, open });
  if (open) await expect(page.locator('.bm-modal')).toBeVisible();
}

const events = (page) => page.evaluate(() => window.__events.splice(0));
const binding = (page, id) => page.evaluate((actionId) => window.__bm.getBinding(actionId), id);
const bindBtn = (page, id, slot) => page.locator(`.bm-bind-btn[data-action-id="${id}"][data-slot="${slot}"][data-device="keyboard"]`);
const header = (page, group) => page.locator(`.bm-group-toggle[data-group="${group}"]`);
const activeIs = (page, selector) => page.evaluate((s) => document.activeElement === document.querySelector(s), selector);

test.describe('modifier-only chords', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('a host default chord shows its label and is found by the search', async ({ page }) => {
    await setup(page, { open: true });
    await expect(bindBtn(page, 'names', 0)).toHaveText('Left Ctrl + Left Shift');
    await page.locator('.bm-search-input').fill('ctrl shift');
    await expect(page.locator('.bm-action-row:visible')).toHaveCount(2);
    await expect(page.locator('.bm-action-row[data-action-id="names"]')).toBeVisible();
    await expect(page.locator('.bm-action-row[data-action-id="select-all"]')).toBeVisible();
  });

  test('records Right Ctrl + Right Shift in the dialog and fires it after the close', async ({ page }) => {
    await setup(page, { open: true });
    await bindBtn(page, 'names', 1).click();
    await expect(page.locator('.bm-capture-modal')).toBeVisible();
    await page.keyboard.down('ShiftRight');
    await page.keyboard.down('ControlRight');
    await page.keyboard.down('ControlRight');
    await expect(page.locator('.bm-capture-modal')).toBeVisible();
    await page.keyboard.up('ControlRight');
    await expect(page.locator('.bm-capture-modal')).toBeHidden();
    await page.keyboard.up('ShiftRight');
    expect(await binding(page, 'names')).toEqual(['ControlLeft+ShiftLeft', 'ControlRight+ShiftRight']);
    await expect(bindBtn(page, 'names', 1)).toHaveText('Right Ctrl + Right Shift');
    expect(await activeIs(page, '.bm-bind-btn[data-action-id="names"][data-slot="1"]')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-modal')).toBeHidden();
    expect(await events(page)).toEqual([]);

    await page.keyboard.down('ControlRight');
    await page.keyboard.down('ShiftRight');
    await page.keyboard.down('ShiftRight');
    await page.keyboard.up('ControlRight');
    await page.keyboard.up('ShiftRight');
    expect(await events(page)).toEqual([
      'names:pressed:ControlRight+ShiftRight',
      'names:held:ControlRight+ShiftRight',
      'names:released:ControlRight+ShiftRight',
    ]);
  });

  test('Ctrl, Shift, A: Ctrl alone, then the chord, then the combo; releases pair up', async ({ page }) => {
    await setup(page);
    await page.locator('#host').focus();
    await page.keyboard.down('ControlLeft');
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyA');
    await page.keyboard.up('KeyA');
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('ControlLeft');
    expect(await events(page)).toEqual([
      'crouch:pressed:ControlLeft',
      'names:pressed:ControlLeft+ShiftLeft',
      'select-all:pressed:ControlLeft+ShiftLeft+KeyA',
      'select-all:released:ControlLeft+ShiftLeft+KeyA',
      'names:released:ControlLeft+ShiftLeft',
      'crouch:released:ControlLeft',
    ]);
  });

  test('Shift then Ctrl is the same chord; letting go of Shift first ends it', async ({ page }) => {
    await setup(page);
    await page.locator('#host').focus();
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ControlLeft');
    expect(await page.evaluate(() => window.__bm.isActionPressed('names'))).toBe(true);
    await page.keyboard.up('ShiftLeft');
    expect(await page.evaluate(() => window.__bm.isActionPressed('names'))).toBe(false);
    await page.keyboard.down('ControlLeft');
    await page.keyboard.up('ControlLeft');
    expect(await events(page)).toEqual([
      'names:pressed:ControlLeft+ShiftLeft',
      'names:released:ControlLeft+ShiftLeft',
    ]);
  });

  test('recording a single modifier and a combo is unchanged', async ({ page }) => {
    await setup(page, { open: true });
    await bindBtn(page, 'jump', 1).click();
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.up('ShiftLeft');
    await expect(page.locator('.bm-capture-modal')).toBeHidden();
    expect((await binding(page, 'jump'))[1]).toBe('ShiftLeft');
    await bindBtn(page, 'jump', 1).click();
    await page.keyboard.down('ControlLeft');
    await page.keyboard.down('KeyJ');
    await page.keyboard.up('ControlLeft');
    await expect(page.locator('.bm-capture-modal')).toBeVisible();
    await page.keyboard.up('KeyJ');
    await expect(page.locator('.bm-capture-modal')).toBeHidden();
    expect((await binding(page, 'jump'))[1]).toBe('ControlLeft+KeyJ');
  });
});

test.describe('focus fixes of the 0.2.2 check', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('N1: a script empties the field while the clear button has focus: the focus goes to the field', async ({ page }) => {
    await setup(page, { open: true });
    await page.locator('.bm-search-input').fill('map');
    await page.locator('.bm-search-clear').focus();
    await page.evaluate(() => {
      const input = document.querySelector('.bm-search-input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('.bm-search-clear')).toBeHidden();
    expect(await activeIs(page, '.bm-search-input')).toBe(true);
    // Escape still works from there
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-modal')).toBeHidden();
  });

  test('N2: registerAction() during a filter keeps the focused header shown and focused', async ({ page }) => {
    await setup(page, { open: true });
    await page.locator('.bm-search-input').fill('space');
    await header(page, 'Movement').focus();
    await page.evaluate(() => window.__bm.setBinding('jump', 0, 'KeyJ'));
    await page.evaluate(() => window.__bm.registerAction({ id: 'late', label: 'Late', group: 'Other' }));
    await expect(header(page, 'Movement')).toBeVisible();
    expect(await activeIs(page, '.bm-group-toggle[data-group="Movement"]')).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('.bm-modal').contains(document.activeElement))).toBe(true);
  });
});
