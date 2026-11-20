/**
 * The demo page, the standalone demo and the examples: they load cleanly, the
 * library's tools are all reachable and working there, and the demo's fake
 * controller makes each family show up in the bindings modal and the
 * Controller Test.
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Collect console errors, page errors and failed requests of a page. */
function watchPage(page) {
  const problems = [];
  page.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`));
  page.on('response', (res) => { if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`); });
  return problems;
}

async function openDemo(page) {
  await page.goto('/demo/');
  await expect(page.locator('#log')).toContainText('Bind Manager demo ready');
}

/** Hold or release one of the fake controller's on-screen inputs (works under an open dialog too). */
async function fakeInput(page, name, down) {
  await page.dispatchEvent(`#fake-pad [data-fake-input="${name}"]`, down ? 'pointerdown' : 'pointerup', { pointerId: 1, button: 0 });
}

const tester = '.bm-tester-modal.bm-tester-open';
const bindings = '.bm-overlay[style*="flex"]';
const remap = '.bm-debug-modal.bm-debug-open';

test.describe('demo page loads cleanly', () => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    test(`no console errors or failed requests at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const problems = watchPage(page);
      await openDemo(page);
      // Every HUD control is on screen and clickable.
      for (const id of ['open-btn', 'open-tester-btn', 'open-remap-btn', 'hint-toggle-btn', 'reset-btn', 'fake-select']) {
        await expect(page.locator(`#${id}`)).toBeInViewport();
      }
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });
  }
});

test.describe('library tools on the demo page', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Controller Test opens from the HUD button and from the bindings modal footer', async ({ page }) => {
    await openDemo(page);
    await page.locator('#open-tester-btn').click();
    await expect(page.locator(tester)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(tester)).toHaveCount(0);

    await page.locator('#open-btn').click();
    await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
    await expect(page.locator(tester)).toBeVisible();
  });

  test('Input Remap opens from the HUD button and from the bindings modal footer', async ({ page }) => {
    await openDemo(page);
    await page.locator('#open-remap-btn').click();
    await expect(page.locator(remap)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(remap)).toHaveCount(0);

    await page.locator('#open-btn').click();
    await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
    await expect(page.locator(remap)).toBeVisible();
  });

  test('Controller Test: Debug panel and Profile editor work with the fake DualSense', async ({ page }) => {
    await openDemo(page);
    await page.locator('#fake-select').selectOption('dualsense');
    await page.locator('#open-tester-btn').click();
    await expect(page.locator('.bm-tester-profile-chip')).toHaveText('Family · DualSense');

    // Debug: last signal, active codes, raw table.
    await page.locator('.bm-tester-debug-btn').click();
    const debug = page.locator('.bm-tester-debug');
    await expect(debug).toBeVisible();
    await expect(debug.locator('.bm-tester-signal dd[data-field="kind"]')).toBeVisible();
    await expect(debug.locator('.bm-tester-signal dd[data-field="resolved"]')).toBeVisible();
    await expect(debug.locator('.bm-tester-active-codes')).toHaveText('Active: (none)');
    await expect(debug.locator('.bm-tester-raw-buttons > span')).toHaveCount(18);
    await expect(debug.locator('.bm-tester-raw-axes > .bm-tester-raw-axis')).toHaveCount(4);
    await fakeInput(page, 'b0', true);
    await expect(debug.locator('.bm-tester-active-codes')).toHaveText('Active: GP_B0=Cross');
    await expect(debug.locator('.bm-tester-signal dd[data-field="code"]')).toHaveText('GP_B0');
    await expect(debug.locator('.bm-tester-signal dd[data-field="resolved"]')).toHaveText('GP_B0 (Cross)');
    await expect(debug.locator('.bm-tester-raw-buttons > span').first()).toHaveText('●B00:1.00');
    await fakeInput(page, 'b0', false);
    await expect(debug.locator('.bm-tester-active-codes')).toHaveText('Active: (none)');

    // Profile editor: every control is there.
    await page.locator('.bm-tester-editor-btn').click();
    const editor = page.locator('.bm-tester-editor');
    await expect(editor).toBeVisible();
    for (const [cls, text] of [
      ['calibrate-btn', 'Calibrate baseline'],
      ['edit-toggle-btn', 'Edit mode'],
      ['capture-update-btn', 'Capture update'],
      ['download-updated-btn', 'Download JSON'],
      ['reset-edits-btn', 'Reset edits'],
    ]) {
      await expect(editor.locator(`.bm-tester-${cls}`)).toHaveText(text);
    }

    // Calibrate baseline runs and completes.
    await editor.locator('.bm-tester-calibrate-btn').click();
    await expect(page.locator('.bm-tester-status')).toContainText('Calibration complete', { timeout: 5000 });

    // Edit mode: map GP_B0 to the raw button the fake presses as GP_B1.
    await editor.locator('.bm-tester-edit-toggle-btn').click();
    await page.locator('.bm-tester-pad [data-code="GP_B0"]').click();
    await expect(editor.locator('.bm-tester-edit-target')).toHaveText('Edit target: GP_B0');
    await fakeInput(page, 'b1', true);
    await expect(editor.locator('.bm-tester-edit-status')).toHaveText(/^Updated GP_B0/);
    await fakeInput(page, 'b1', false);
    await expect(page.locator('.bm-tester-profile-chip')).toHaveText('Edited');

    // Download JSON exports the in-memory profile.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      editor.locator('.bm-tester-download-updated-btn').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    // Capture update is enabled with a target selected; Reset edits discards the edit.
    await expect(editor.locator('.bm-tester-capture-update-btn')).toBeEnabled();
    await expect(editor.locator('.bm-tester-reset-edits-btn')).toBeEnabled();
    await editor.locator('.bm-tester-reset-edits-btn').click();
    await expect(editor.locator('.bm-tester-edit-status')).toHaveText('Discarded the in-memory mapping edits of this controller.');
    await expect(page.locator('.bm-tester-profile-chip')).toHaveText('Family · DualSense');
  });

  test('Input Remap: guided capture runs a baseline and one step with the fake DualSense', async ({ page }) => {
    test.setTimeout(45000);
    await openDemo(page);
    await page.locator('#fake-select').selectOption('dualsense');
    await page.locator('#open-remap-btn').click();
    await expect(page.locator(remap)).toBeVisible();

    await page.locator('.bm-debug-start-btn').click();
    await expect(page.locator('.bm-debug-status')).toContainText('Baseline captured', { timeout: 6000 });
    await expect(page.locator('.bm-debug-progress')).toHaveText('Step 1/28: Cross');

    await fakeInput(page, 'b0', true);
    await page.locator('.bm-debug-capture-btn').click();
    await expect(page.locator('.bm-capture-mini-modal.bm-open')).toBeVisible();
    await expect(page.locator('.bm-capture-mini-modal.bm-open')).toHaveCount(0, { timeout: 8000 });
    await fakeInput(page, 'b0', false);
    await expect(page.locator('.bm-debug-status')).toContainText('Captured: GP_B0');

    const payload = JSON.parse(await page.locator('.bm-debug-results').inputValue());
    expect(payload.runMeta.targetController).toMatchObject({
      index: 0,
      id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      buttons: 18,
      axes: 4,
    });
    expect(payload.runMeta.baseline.buttons).toHaveLength(18);
    expect(payload.runMeta.baseline.axes).toHaveLength(4);
    expect(payload.runMeta.completedSteps).toBe(1);
    expect(payload.captures[0]).toMatchObject({ expectedCode: 'GP_B0', matched: true, detected: { code: 'GP_B0', kind: 'button', index: 0 } });
    expect(payload.controllerDefinition.buttons.GP_B0.buttonIndex).toBe(0);
  });
});

test.describe('fake controller families', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // chip: the profile chip in the bindings modal and the Controller Test;
  // b17: the label of Open Map's gamepad default (GP_B17) in the bindings modal.
  const FAMILIES = [
    { key: 'xbox', chip: 'Family · Xbox', b17: 'Share' },
    { key: 'xbox-elite', chip: 'Family · Xbox', b17: 'Paddle 1' },
    { key: 'xbox360', chip: 'Family · Xbox 360', b17: 'GP_B17' },
    { key: 'dualshock4', chip: 'Family · DualShock 4', b17: 'Touchpad' },
    { key: 'dualsense', chip: 'Family · DualSense', b17: 'Touchpad' },
    { key: 'switch-pro', chip: 'Family · Switch Pro', b17: 'Capture' },
    { key: 'steam-deck', chip: 'Family · Steam', b17: 'Quick Access' },
    { key: 'stadia', chip: 'Family · Stadia', b17: 'Assistant' },
    { key: 'unknown', chip: 'Generic', b17: 'Btn 17' },
  ];

  test('each family shows in the bindings modal and the Controller Test', async ({ page }) => {
    const problems = watchPage(page);
    await openDemo(page);
    await expect(page.locator('#fake-select option')).toHaveCount(FAMILIES.length + 1);
    for (const fam of FAMILIES) {
      await page.locator('#fake-select').selectOption(fam.key);
      await page.locator('#open-btn').click();
      await expect(page.locator('.bm-profile-chip'), fam.key).toHaveText(fam.chip);
      await expect(page.locator('.bm-bind-btn[data-action-id="open-map"][data-device="gamepad"]'), fam.key).toHaveText(fam.b17);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
      await expect(page.locator('.bm-tester-profile-chip'), fam.key).toHaveText(fam.chip);
      await page.keyboard.press('Escape');
      await expect(page.locator(tester)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator(bindings)).toHaveCount(0);
    }
    await page.locator('#fake-select').selectOption('');
    await expect(page.locator('#fake-status')).toHaveText('No simulated pad');
    expect(problems).toEqual([]);
  });

  test('switching the family while an on-screen button is held releases it', async ({ page }) => {
    await openDemo(page);
    await page.locator('#fake-select').selectOption('dualsense');
    await fakeInput(page, 'b0', true);
    await expect(page.locator('#fake-pad .is-down')).toHaveCount(1);
    await page.locator('#fake-select').selectOption('xbox');
    await expect(page.locator('#fake-pad .is-down')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.getGamepads()[0].buttons[0].pressed)).toBe(false);
  });

  test('an on-screen input drives the game actions', async ({ page }) => {
    await openDemo(page);
    await page.locator('#fake-select').selectOption('xbox');
    await expect(page.locator('#fake-pad [data-fake-input="b0"]')).toHaveText('A');
    await fakeInput(page, 'b0', true);
    await expect(page.locator('#log')).toContainText('jump!');
    await fakeInput(page, 'b0', false);
    await fakeInput(page, 'ls-up', true);
    await expect(page.locator('#log')).toContainText('move-forward pressed');
    await fakeInput(page, 'ls-up', false);
    await expect(page.locator('#log')).toContainText('move-forward released');
  });
});

test.describe('standalone demo and examples', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('dist/standalone-demo.html loads the built bundle with no errors', async ({ page }) => {
    expect(existsSync(`${ROOT}dist/bind-manager.min.js`), 'run npm run build first').toBe(true);
    const problems = watchPage(page);
    await page.goto('/dist/standalone-demo.html');
    await expect(page.locator('#log')).toContainText('Demo ready');
    await page.locator('#open-tester').click();
    await expect(page.locator(tester)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#fake-select').selectOption('dualsense');
    await page.locator('#open-binds').click();
    await expect(page.locator('.bm-profile-chip')).toHaveText('Family · DualSense');
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('examples/standalone runs with no errors', async ({ page }) => {
    const problems = watchPage(page);
    await page.goto('/examples/standalone/');
    await expect(page.locator('#log')).toContainText('ready');
    await page.locator('#open-binds').click();
    await expect(page.locator(bindings)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });
});

/**
 * Screenshots of the demo page. Opt-in: skipped unless BM_DEMO_SCREENS names an
 * output directory. Produces files only; nothing is compared.
 *
 *   BM_DEMO_SCREENS=/path/to/out npx playwright test tests/e2e/demo.spec.js --workers=1
 */
test.describe('demo screenshots', () => {
  const OUT = process.env.BM_DEMO_SCREENS;
  test.skip(!OUT, 'set BM_DEMO_SCREENS=<dir> to produce screenshots');

  const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });

  for (const [w, h] of [[1920, 1080], [1280, 720], [2560, 1440], [1000, 600], [390, 844]]) {
    test(`HUD at ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openDemo(page);
      await page.locator('#fake-select').selectOption('dualsense');
      await shot(page, `demo-hud-${w}x${h}`);
    });
  }

  test('Controller Test with Debug and Profile editor on, fake DualSense', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openDemo(page);
    await page.locator('#fake-select').selectOption('dualsense');
    await page.locator('#open-tester-btn').click();
    await page.locator('.bm-tester-debug-btn').click();
    await page.locator('.bm-tester-editor-btn').click();
    await fakeInput(page, 'b0', true);
    await fakeInput(page, 'ls-up', true);
    await expect(page.locator('.bm-tester-active-codes')).toContainText('GP_B0=Cross');
    await shot(page, 'demo-tester-debug-editor-dualsense-1920x1080');
  });
});
