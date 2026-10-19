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
