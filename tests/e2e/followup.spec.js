/**
 * Follow-up items of the integration check (F1..F11) that need a real browser.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad } from './helpers/fake-gamepad.js';
import { openHarness, openTesterDirect, frames, padNodeState } from './helpers/harness.js';

const XBOX_SERIES = Object.freeze({
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
  mapping: 'standard',
  buttonCount: 17,
  axisCount: 4,
});

test.describe('F3: Reset edits in the tester', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('an edit enables Reset edits; it restores the pad and disables itself', async ({ page }) => {
    const pad = await installFakeGamepad(page, XBOX_SERIES);
    await openHarness(page);
    await pad.connect();
    await openTesterDirect(page);
    await page.locator('.bm-tester-editor-btn').click();
    const reset = page.locator('.bm-tester-reset-edits-btn');
    await expect(reset).toBeDisabled();

    await page.locator('.bm-tester-edit-toggle-btn').click();
    await page.locator('.bm-tester-pad [data-code="GP_B0"]').click();
    await pad.setButton(3, 1);
    await expect(page.locator('.bm-tester-edit-status')).toHaveText(/^Updated GP_B0/);
    await pad.setButton(3, 0);
    await expect(page.locator('.bm-tester-profile-chip')).toHaveAttribute('data-source', 'memory-edit');
    await expect(reset).toBeEnabled();

    // Raw 0 no longer lights GP_B0.
    await pad.setButton(0, 1);
    await frames(page, 3);
    expect((await padNodeState(page, 'GP_B0')).active).toBe(false);
    await pad.setButton(0, 0);

    await reset.click();
    await expect(page.locator('.bm-tester-profile-chip')).toHaveAttribute('data-source', 'family');
    await expect(reset).toBeDisabled();
    expect(await page.evaluate(() => window.__bm.getResolvedGamepadProfile(0).source)).toBe('family');
    await pad.setButton(0, 1);
    await frames(page, 3);
    expect((await padNodeState(page, 'GP_B0')).active).toBe(true);
    await pad.setButton(0, 0);
    // Focus did not fall to body when the button disabled itself.
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });
});
