/**
 * 0.2.4, a keyup the page never saw, with real (trusted) key events in
 * Chromium. The page swallows the keyup before the library's window listener
 * (a capturing listener that stops it), as a host, another frame or a native
 * menu can; the window keeps its focus.
 */
import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.goto('/package.json');
  await page.setContent('<!doctype html><html><body style="margin:0;background:#0b1020"></body></html>');
  await page.evaluate(async () => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace: `lost-${Math.random()}` });
    window.__bm = bm;
    bm.registerActions([
      { id: 'crouch', defaultBindings: ['ControlLeft'] },
      { id: 'run', defaultBindings: ['ShiftLeft'] },
      { id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] },
      { id: 'select', defaultBindings: ['ControlLeft+KeyA'] },
      { id: 'jump', defaultBindings: ['KeyA'] },
    ]);
    window.__events = [];
    bm.onAnyAction((e) => { if (e.type !== 'held') window.__events.push(`${e.actionId}:${e.type}`); });
    window.__swallow = new Set();
    window.addEventListener('keyup', (e) => {
      if (window.__swallow.delete(e.code)) e.stopImmediatePropagation();
    }, true);
  });
}

const swallowNextKeyup = (page, code) => page.evaluate((c) => window.__swallow.add(c), code);
const events = (page) => page.evaluate(() => window.__events.splice(0));

test.describe('a lost keyup (Chromium, trusted events)', () => {
  test('a lost Ctrl keyup: Shift alone fires Shift, not Ctrl+Shift, and Ctrl is released first', async ({ page }) => {
    await setup(page);
    await page.keyboard.down('Control');
    await swallowNextKeyup(page, 'ControlLeft');
    await page.keyboard.up('Control');
    expect(await events(page)).toEqual(['crouch:pressed']);
    await page.keyboard.press('Shift');
    expect(await events(page)).toEqual(['crouch:released', 'run:pressed', 'run:released']);
    expect(await page.evaluate(() => window.__bm.isActionPressed('crouch'))).toBe(false);
  });

  test('a lost Ctrl keyup: A fires A, not Ctrl+A', async ({ page }) => {
    await setup(page);
    await page.keyboard.down('Control');
    await swallowNextKeyup(page, 'ControlLeft');
    await page.keyboard.up('Control');
    await page.keyboard.press('KeyA');
    expect(await events(page)).toEqual(['crouch:pressed', 'crouch:released', 'jump:pressed', 'jump:released']);
  });

  test('a lost keyup of A: the next keydown of A releases the first press', async ({ page }) => {
    await setup(page);
    await page.keyboard.down('KeyA');
    await swallowNextKeyup(page, 'KeyA');
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyA');
    expect(await events(page)).toEqual(['jump:pressed', 'jump:released', 'jump:pressed']);
    await page.keyboard.up('KeyA');
    expect(await events(page)).toEqual(['jump:released']);
  });

  test('without a lost keyup nothing changes: Ctrl, Shift fires the chord once; Ctrl+A the combo', async ({ page }) => {
    await setup(page);
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.up('Shift');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    expect(await events(page)).toEqual(['crouch:pressed', 'names:pressed', 'names:released', 'select:pressed', 'select:released', 'crouch:released']);
  });

  test('a synthetic event is not read for flags (0.2.3 behaviour)', async ({ page }) => {
    await setup(page);
    await page.keyboard.down('Control');
    await swallowNextKeyup(page, 'ControlLeft');
    await page.keyboard.up('Control');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    });
    expect(await events(page)).toEqual(['crouch:pressed', 'select:pressed', 'select:released']);
  });
});
