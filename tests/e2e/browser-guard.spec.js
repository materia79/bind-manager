import { test, expect } from '@playwright/test';

// The demo enables `browserGuard` with the game area as target: clicking it focuses
// the area (and requests pointer lock), which engages the guard.

async function recordDefaults(page) {
  await page.evaluate(() => {
    window.__defaults = [];
    // Bubble-phase window listeners run after the guard's capture-phase ones.
    for (const type of ['keydown', 'wheel', 'contextmenu', 'mousedown']) {
      window.addEventListener(type, (e) => {
        window.__defaults.push({ type, code: e.code ?? null, button: e.button ?? null, prevented: e.defaultPrevented });
      }, { passive: true });
    }
  });
}

const takeDefaults = (page) => page.evaluate(() => window.__defaults.splice(0));

test.describe('Browser shortcut guard (demo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    await recordDefaults(page);
  });

  test('cancels browser shortcuts only while the game area owns input', async ({ page }) => {
    await page.keyboard.press('Control+KeyS');
    expect((await takeDefaults(page)).find((e) => e.code === 'KeyS').prevented).toBe(false);

    await page.mouse.click(400, 500);
    await expect(page.locator('#guard-status')).toContainText('engaged');

    for (const combo of ['Control+KeyS', 'Control+KeyF', 'Control+Equal', 'Space', 'F3', 'Alt']) {
      await page.keyboard.press(combo);
    }
    const events = (await takeDefaults(page)).filter((e) => e.type === 'keydown' && !e.code.startsWith('Control'));
    for (const e of events) expect(e.prevented, e.code).toBe(true);

    // Unlisted, unbound key is left alone
    await page.keyboard.press('KeyK');
    expect((await takeDefaults(page)).find((e) => e.code === 'KeyK').prevented).toBe(false);
  });

  test('wheel listeners are non-passive: page scroll and Ctrl+wheel zoom are cancelled', async ({ page }) => {
    await page.mouse.click(400, 500);
    await page.mouse.move(400, 500);
    await page.mouse.wheel(0, 120);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    const wheels = (await takeDefaults(page)).filter((e) => e.type === 'wheel');
    expect(wheels.length).toBeGreaterThanOrEqual(2);
    for (const e of wheels) expect(e.prevented).toBe(true);

    await expect(page.locator('#log')).toContainText('next item (wheel notch)');
    await expect(page.locator('#log')).toContainText('zoom camera in');
  });

  test('context menu and middle click are cancelled while engaged', async ({ page }) => {
    await page.mouse.click(400, 500);
    // Chromium fires no contextmenu under pointer lock; stay engaged via focus instead.
    await page.evaluate(() => document.exitPointerLock());
    await expect(page.locator('#guard-status')).not.toContainText('pointer lock');
    await expect(page.locator('#guard-status')).toContainText('engaged');
    await page.mouse.click(400, 500, { button: 'right' });
    await page.mouse.click(400, 500, { button: 'middle' });
    const events = await takeDefaults(page);
    expect(events.find((e) => e.type === 'contextmenu').prevented).toBe(true);
    expect(events.find((e) => e.type === 'mousedown' && e.button === 1).prevented).toBe(true);
  });

  test('does not interfere while the bindings modal is open', async ({ page }) => {
    await page.mouse.click(400, 500);
    // Under pointer lock the HUD is unreachable; the demo's debug key opens the modal.
    await page.keyboard.press('F5');
    await expect(page.locator('.bm-modal')).toBeVisible();
    await page.keyboard.press('Control+KeyF');
    expect((await takeDefaults(page)).find((e) => e.code === 'KeyF').prevented).toBe(false);
  });

  test('a bound right button cancels the context menu on the game surface only, not in text fields', async ({ page }) => {
    // A second manager with the right button bound and the guard off, so only
    // the mouse runtime's gameplay handling is in play (the demo's guard is not
    // engaged: focus never enters its game area).
    await page.evaluate(async () => {
      const { createBindManager } = await import('/src/index.js');
      const storage = { load: () => null, save() {}, clear() {} };
      window.__aimManager = createBindManager({ namespace: 'e2e-aim', storage, container: document.createElement('div') });
      window.__aimManager.registerAction({ id: 'aim', defaultBindings: ['MouseButton2'] });
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;display:flex;gap:8px;padding:8px';
      fixture.innerHTML = `
        <div id="e2e-surface" style="width:120px;height:60px;background:#333"></div>
        <textarea id="e2e-chat" style="width:120px;height:60px"></textarea>
        <input id="e2e-name" type="text" style="width:120px;height:60px">
        <div id="e2e-notes" contenteditable="true" style="width:120px;height:60px"><b id="e2e-bold">bold</b></div>`;
      document.body.appendChild(fixture);
      // Registered after the manager's window listeners, so it sees their verdict
      window.__menus = [];
      window.addEventListener('contextmenu', (e) => {
        window.__menus.push({ id: e.target.id, button: e.button, prevented: e.defaultPrevented });
      });
    });
    const prevented = {};
    for (const id of ['e2e-surface', 'e2e-chat', 'e2e-name', 'e2e-bold']) {
      await page.locator(`#${id}`).click({ button: 'right' });
      const menus = await page.evaluate(() => window.__menus.splice(0));
      expect(menus.length, id).toBe(1);
      expect(menus[0].button, id).toBe(2);
      prevented[id] = menus[0].prevented;
    }
    expect(prevented).toEqual({ 'e2e-surface': true, 'e2e-chat': false, 'e2e-name': false, 'e2e-bold': false });
    await page.evaluate(() => window.__aimManager.destroy());
  });

  test('binds a wheel notch from the remap UI', async ({ page }) => {
    await page.locator('#open-btn').click();
    const row = page.locator('.bm-action-row', { hasText: 'Previous Item' });
    const slot = row.locator('.bm-bind-btn[data-device="keyboard"]').nth(1);
    await slot.click();
    await expect(slot).toHaveText(/Press a key/);
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 120);
    await expect(slot).toHaveText('Wheel Down');
  });
});
