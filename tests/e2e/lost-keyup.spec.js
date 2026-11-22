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
      { id: 'walk', defaultBindings: ['KeyW'] },
    ]);
    // A host's on-screen or remapped key: a synthetic KeyboardEvent on window
    window.__synth = (type, code, init = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init }));
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

  test('a Shift held by a synthetic keydown (a host\'s on-screen key) is not released by a real W', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__synth('keydown', 'ShiftLeft', { shiftKey: true }));
    await page.keyboard.press('KeyW');
    expect(await events(page)).toEqual(['run:pressed', 'walk:pressed', 'walk:released']);
    expect(await page.evaluate(() => window.__bm.isActionPressed('run'))).toBe(true);
    await page.evaluate(() => window.__synth('keyup', 'ShiftLeft'));
    expect(await events(page)).toEqual(['run:released']);
  });

  test('three synthetic keydowns and one keyup: pressed three times, released once (0.2.3)', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__synth('keydown', 'KeyW'); window.__synth('keyup', 'KeyW'); });
    expect(await events(page)).toEqual(['walk:pressed', 'walk:pressed', 'walk:pressed', 'walk:released']);
  });

  test('mixed: held by a synthetic keydown, a real keydown is no repair; held by a real keydown, a synthetic one is none either', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__synth('keydown', 'KeyW'));
    await page.keyboard.down('KeyW');
    expect(await events(page)).toEqual(['walk:pressed', 'walk:pressed']);
    await page.keyboard.up('KeyW');
    await page.evaluate(() => window.__synth('keyup', 'KeyW'));
    expect(await events(page)).toEqual(['walk:released']);

    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.__synth('keydown', 'KeyW'));
    // The real keyup is lost, then a real keydown again: the synthetic source may hold W, so no release
    await swallowNextKeyup(page, 'KeyW');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyW');
    expect(await events(page)).toEqual(['walk:pressed', 'walk:pressed', 'walk:pressed']);
    await page.keyboard.up('KeyW');
    expect(await events(page)).toEqual(['walk:released']);
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
