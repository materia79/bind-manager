/**
 * Integration of the lanes: the tester on the real manager, focus across the
 * bindings modal and the tool dialogs.
 */
import { test, expect } from '@playwright/test';
import { installFakeGamepad } from './helpers/fake-gamepad.js';
import { openHarness, openTesterDirect, frames, padNodeState, takeEvents } from './helpers/harness.js';

const XBOX_SERIES = Object.freeze({
  id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
  mapping: 'standard',
  buttonCount: 17,
  axisCount: 4,
});

test.describe('J14: Profile editor on a pad without an exact profile', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('editing one button keeps every other button lit and dispatching', async ({ page }) => {
    const pad = await installFakeGamepad(page, XBOX_SERIES);
    await openHarness(page);
    await pad.connect();
    await openTesterDirect(page);
    await page.locator('.bm-tester-editor-btn').click();
    await page.locator('.bm-tester-edit-toggle-btn').click();
    await page.locator('.bm-tester-pad [data-code="GP_B0"]').click();
    await expect(page.locator('.bm-tester-edit-target')).toHaveText('Edit target: GP_B0');

    // Hold raw 3 until edit mode assigns it to GP_B0.
    await pad.setButton(3, 1);
    await expect(page.locator('.bm-tester-edit-status')).toHaveText(/^Updated GP_B0/);
    await pad.setButton(3, 0);
    await frames(page, 4);

    // Every other button still lights in the tester.
    for (const i of [1, 2, 4, 5, 8, 9, 12, 15, 16]) {
      await pad.setButton(i, 1);
      await frames(page, 3);
      expect((await padNodeState(page, `GP_B${i}`)).active, `GP_B${i} lights`).toBe(true);
      await pad.setButton(i, 0);
      await frames(page, 3);
    }
    await pad.setAxis(0, -1);
    await frames(page, 3);
    expect((await padNodeState(page, 'GP_A0N')).active).toBe(true);
    await pad.setAxis(0, 0);

    // ... and still dispatches once the tester is closed.
    await page.keyboard.press('Escape');
    await expect(page.locator('.bm-tester-modal.bm-tester-open')).toHaveCount(0);
    await frames(page, 3);
    await takeEvents(page);
    for (const i of [1, 2, 9, 16]) {
      await pad.setButton(i, 1);
      await frames(page, 3);
      await pad.setButton(i, 0);
      await frames(page, 3);
    }
    await pad.setButton(3, 1);
    await frames(page, 3);
    await pad.setButton(3, 0);
    await frames(page, 3);
    const pressed = (await takeEvents(page)).filter((e) => e.endsWith(':pressed'));
    expect(pressed).toEqual(['GP_B1:pressed', 'GP_B2:pressed', 'GP_B9:pressed', 'GP_B16:pressed', 'GP_B0:pressed', 'GP_B3:pressed']);
  });
});
