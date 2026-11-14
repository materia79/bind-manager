/**
 * Screenshots of the bindings modal, capture modal and hint bar (styles lane).
 * Opt-in: skipped unless BM_SCREENS is set. Produces files only.
 *
 *   BM_SCREENS=after npx playwright test tests/e2e/screens-styles.spec.js --workers=1
 *
 * Output: test-results/screens-<BM_SCREENS>/<surface>-<state>-<WxH>.png
 * Note: Playwright empties test-results/ at the start of every run.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';
import { SCREENS } from './helpers/screens.js';

const SET = process.env.BM_SCREENS;
const OUT_DIR = fileURLToPath(new URL(`../../test-results/screens-${SET}/`, import.meta.url));

const STYLE_SCREENS = [...SCREENS, { name: '1000x600', width: 1000, height: 600 }];

test.skip(!SET, 'set BM_SCREENS=<name> to produce screenshots');

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

for (const screen of STYLE_SCREENS) {
  test.describe(`styles screens @ ${screen.name}`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });

    test('hint bar', async ({ page }) => {
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await expect(page.locator('.bm-hints')).toBeVisible();
      await shoot(page, 'hint-bar', 'visible', screen);
    });

    test('bindings modal', async ({ page }) => {
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await openBindings(page);
      await shoot(page, 'bindings-modal', 'open', screen);
    });

    test('bindings modal with a controller', async ({ page }) => {
      const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await pad.connect();
      await openBindings(page);
      await expect(page.locator('.bm-profile-chip')).toBeVisible();
      await shoot(page, 'bindings-modal', 'gamepad', screen);
    });

    test('capture modal', async ({ page }) => {
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await openBindings(page);
      await page.locator('.bm-bind-btn').first().click();
      await expect(page.locator('.bm-capture-modal')).toBeVisible();
      await shoot(page, 'capture-modal', 'waiting', screen);
    });
  });
}
