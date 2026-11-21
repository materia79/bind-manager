/**
 * PR #2 adapted to the browser guard: binding a reserved key in the real
 * bindings modal shows the note, conflict first, with the full text in the
 * title. The key events are dispatched inside the page, so the browser itself
 * never sees Ctrl+W.
 */
import { test, expect } from '@playwright/test';

test.describe('reserved-key note in the bindings modal', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('Ctrl+W on a slot: the conflict and the fullscreen-only note, title holds the full text', async ({ page }) => {
    await page.goto('/package.json');
    await page.setContent('<!doctype html><html><head></head><body></body></html>');
    await page.evaluate(async () => {
      const { createBindManager } = await import('/src/index.js');
      window.__bm = createBindManager({ namespace: `reserved-e2e-${Math.random()}` });
      window.__bm.registerAction({ id: 'close-bag', label: 'Close bag', slots: 1, defaultBindings: ['KeyB'] });
      window.__bm.registerAction({ id: 'quit-menu', label: 'Quit menu', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
      window.__bm.open();
    });
    await page.locator('.bm-bind-btn[data-action-id="close-bag"][data-slot="0"][data-device="keyboard"]').click();
    await page.evaluate(() => {
      const fire = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, ctrlKey: true, bubbles: true, cancelable: true }));
      fire('keydown', 'ControlLeft');
      fire('keydown', 'KeyW');
      fire('keyup', 'KeyW');
      fire('keyup', 'ControlLeft');
    });
    const warning = page.locator('.bm-conflict-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(/is also bound to "Quit menu" — both will be active\. .+ only works while the game is fullscreen in a Chromium browser\. The browser uses it to close the tab\. In fullscreen the game has to cancel the browser's action itself; the browser guard does that\.$/);
    const { text, title } = await warning.evaluate((el) => ({ text: el.textContent, title: el.getAttribute('title') }));
    expect(title).toBe(text);
    expect(text.indexOf('also bound')).toBeLessThan(text.indexOf('only works'));
    expect(await page.evaluate(() => window.__bm.getBinding('close-bag')[0])).toBe('ControlLeft+KeyW');
  });
});
