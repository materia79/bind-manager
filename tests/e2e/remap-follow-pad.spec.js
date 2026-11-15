/**
 * Final check m3 on the demo page: Input Remap's JSON follows the simulated
 * controller. A pad connected while the tool is open is in the JSON before
 * Start Debug; swapping the DualSense for an Xbox pad after the baseline says
 * so, discards the old pad's baseline and steps, and needs a new baseline.
 */
import { test, expect } from '@playwright/test';

const REMAP = '.bm-debug-modal.bm-debug-open .bm-debug-panel';
const DUALSENSE_ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';

const payload = async (page) => JSON.parse(await page.locator('.bm-debug-results').inputValue());
// The picker sits on the page under the open dialog; set it the way a script would.
const pick = (page, key) => page.locator('#fake-select').evaluate((select, value) => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, key);

test.describe('Input Remap follows the simulated controller', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('connect while open; swap DualSense for Xbox after the baseline', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/demo/');
    await page.waitForSelector('#open-remap-btn');
    await pick(page, '');
    await page.locator('#open-remap-btn').click();
    await expect(page.locator(REMAP)).toBeVisible();
    expect((await payload(page)).runMeta.targetController).toBeNull();
    await expect(page.locator('.bm-debug-validation')).toContainText('Missing targetController');

    // connected while the tool is open, before Start Debug
    await pick(page, 'dualsense');
    await expect.poll(async () => (await payload(page)).runMeta.targetController?.id).toBe(DUALSENSE_ID);
    await expect(page.locator('.bm-debug-validation')).not.toContainText('Missing targetController');

    await page.locator('.bm-debug-start-btn').click();
    await expect(page.locator('.bm-debug-status')).toContainText('Baseline captured', { timeout: 6000 });
    await page.dispatchEvent('#fake-pad [data-fake-input="b0"]', 'pointerdown', { pointerId: 1, button: 0 });
    await page.locator('.bm-debug-capture-btn').click();
    await expect(page.locator('.bm-capture-mini-modal.bm-open')).toBeVisible();
    await expect(page.locator('.bm-capture-mini-modal.bm-open')).toHaveCount(0, { timeout: 8000 });
    await page.dispatchEvent('#fake-pad [data-fake-input="b0"]', 'pointerup', { pointerId: 1, button: 0 });
    expect((await payload(page)).runMeta.completedSteps).toBe(1);

    // swapped after the baseline
    await pick(page, 'xbox');
    await expect(page.locator('.bm-debug-status')).toContainText('controller changed', { timeout: 3000 });
    await expect(page.locator('.bm-debug-status')).toContainText('1 captured step(s) were discarded');
    const p = await payload(page);
    expect(p.runMeta.targetController.id).toBe(XBOX_ID);
    expect(p.runMeta.baseline).toBeNull();
    expect(p.runMeta.completedSteps).toBe(0);
    await expect(page.locator('.bm-debug-capture-btn')).toBeDisabled();

    await page.locator('.bm-debug-start-btn').click();
    await expect(page.locator('.bm-debug-status')).toContainText('Baseline captured', { timeout: 6000 });
    const after = await payload(page);
    expect(after.runMeta.baseline).not.toBeNull();
    expect(after.runMeta.targetController.id).toBe(XBOX_ID);
    await expect(page.locator('.bm-debug-capture-btn')).toBeEnabled();
  });
});
