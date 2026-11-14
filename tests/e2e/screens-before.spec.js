/**
 * Baseline screenshots for the UI/UX round. Produces files only; nothing is
 * compared, so visual differences never fail the e2e run.
 *
 * Output: test-results/screens-before/<surface>-<state>-<WxH>.png, plus
 * tester-panel-boxes.json with the Controller Tester panel bounding boxes.
 * Note: Playwright empties test-results/ at the start of every run.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';
import { SCREENS } from './helpers/screens.js';

const OUT_DIR = fileURLToPath(new URL('../../test-results/screens-before/', import.meta.url));

/** @param {import('@playwright/test').Page} page */
async function shoot(page, surface, state, screen) {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: `${OUT_DIR}${surface}-${state}-${screen.name}.png`, animations: 'disabled' });
}

/** @param {import('@playwright/test').Page} page */
async function openBindings(page) {
  await page.locator('#open-btn').click();
  await expect(page.locator('.bm-modal')).toBeVisible();
}

for (const screen of SCREENS) {
  test.describe(`screens before @ ${screen.name}`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
    });

    test('hint bar', async ({ page }) => {
      await expect(page.locator('.bm-hints')).toBeVisible();
      await shoot(page, 'hint-bar', 'visible', screen);
    });

    test('bindings modal', async ({ page }) => {
      await openBindings(page);
      await shoot(page, 'bindings-modal', 'open', screen);
    });

    test('capture modal', async ({ page }) => {
      await openBindings(page);
      await page.locator('.bm-bind-btn').first().click();
      await expect(page.locator('.bm-capture-modal')).toBeVisible();
      await shoot(page, 'capture-modal', 'waiting', screen);
    });

    test('input remap', async ({ page }) => {
      await openBindings(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
      await expect(page.locator('.bm-debug-modal.bm-debug-open')).toBeVisible();
      await shoot(page, 'input-remap', 'open', screen);
    });
  });

  test.describe(`screens before @ ${screen.name} (gamepad)`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });

    test('controller tester', async ({ page }) => {
      const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await pad.connect();

      await openBindings(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
      const panel = page.locator('.bm-tester-modal.bm-tester-open .bm-tester-panel');
      await expect(panel).toBeVisible();

      // (a) connected and idle
      await expect(page.locator('.bm-tester-profile-status')).not.toContainText('waiting for controller');
      await expect(page.locator('.bm-tester-last-signal')).toHaveText('Last strongest signal: (none)');
      const idleBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'idle', screen);

      // (b) left stick up-left, Cross + R1 held
      await pad.setAxes({ 0: -1, 1: -1 });
      await pad.setButtons({ 0: 1, 5: 1 });
      await expect(page.locator('.bm-tester-last-signal')).toContainText('kind:');
      await expect(page.locator('.bm-tester-active-codes')).toContainText('GP_B0');
      await expect(page.locator('.bm-tester-active-codes')).toContainText('GP_B5');
      const activeBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'active', screen);

      mkdirSync(OUT_DIR, { recursive: true });
      const boxes = { screen: screen.name, idle: idleBox, active: activeBox };
      writeFileSync(`${OUT_DIR}tester-panel-boxes-${screen.name}.json`, JSON.stringify(boxes, null, 2));
      test.info().annotations.push({ type: 'tester-panel-boxes', description: JSON.stringify(boxes) });
    });
  });
}
