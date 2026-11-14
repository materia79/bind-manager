/**
 * Screenshots for the UI/UX round. Opt-in: skipped unless BM_SCREENS is set.
 * Produces files only; nothing is compared, so visual differences never fail.
 *
 *   BM_SCREENS=before npx playwright test tests/e2e/screens.spec.js --workers=1
 *
 * Output: test-results/screens-<BM_SCREENS>/<surface>-<state>-<WxH>.png, plus
 * tester-panel-boxes-<WxH>.json with the Controller Tester panel bounding boxes
 * and pad-<family>.png renders of the live controller view per label family.
 * Note: Playwright empties test-results/ at the start of every run.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installFakeGamepad, DUALSENSE_CHROME } from './helpers/fake-gamepad.js';
import { SCREENS } from './helpers/screens.js';

const SET = process.env.BM_SCREENS;
const OUT_DIR = fileURLToPath(new URL(`../../test-results/screens-${SET}/`, import.meta.url));

/** The tools also get a below-the-floor viewport. */
const TOOL_SCREENS = [...SCREENS, { name: '1000x600', width: 1000, height: 600 }];

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

/** @param {import('@playwright/test').Page} page */
async function openWithPad(page) {
  const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
  await page.goto('/demo/');
  await page.waitForSelector('#open-btn');
  await pad.connect();
  await openBindings(page);
  return pad;
}

for (const screen of SCREENS) {
  test.describe(`screens @ ${screen.name}`, () => {
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
  });
}

for (const screen of TOOL_SCREENS) {
  test.describe(`screens @ ${screen.name} (tools)`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });

    test('input remap', async ({ page }) => {
      const pad = await openWithPad(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
      const panel = page.locator('.bm-debug-modal.bm-debug-open .bm-debug-panel');
      await expect(panel).toBeVisible();
      await shoot(page, 'input-remap', 'idle', screen);

      // Baseline (2 s), then a held stick fills the live box.
      await panel.locator('.bm-debug-start-btn').click();
      await expect(panel.locator('.bm-debug-capture-btn')).toBeEnabled({ timeout: 6000 });
      await pad.setAxes({ 0: -1, 1: -0.4 });
      await expect(panel.locator('.bm-debug-live-state')).toHaveText('Strongest signal');
      await shoot(page, 'input-remap', 'active', screen);
    });

    test('controller tester', async ({ page }) => {
      const pad = await openWithPad(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
      const panel = page.locator('.bm-tester-modal.bm-tester-open .bm-tester-panel');
      await expect(panel).toBeVisible();

      // (a) connected and idle: the profile picker is enabled once the tester has seen the pad
      await expect(panel.locator('select').first()).toBeEnabled();
      await expect(panel.locator('.bm-active')).toHaveCount(0);
      const idleBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'idle', screen);

      // (b) left stick up-left, Cross + R1 held, L2 half pulled.
      await pad.setAxes({ 0: -1, 1: -1 });
      await pad.setButtons({ 0: 1, 5: 1, 6: 0.5 });
      await expect.poll(() => panel.locator('.bm-active').count()).toBeGreaterThanOrEqual(2);
      const activeBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'active', screen);

      // (c) Debug on
      await panel.locator('.bm-tester-debug-btn').click();
      await expect(panel.locator('.bm-tester-signal dd[data-field="kind"]')).not.toHaveText('—');
      const debugBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'active-debug', screen);

      // (d) Profile editor on (Debug off)
      await panel.locator('.bm-tester-debug-btn').click();
      await panel.locator('.bm-tester-editor-btn').click();
      await expect(panel.locator('.bm-tester-editor')).toBeVisible();
      const editorBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'active-editor', screen);

      // (e) both
      await panel.locator('.bm-tester-debug-btn').click();
      const bothBox = await panel.boundingBox();
      await shoot(page, 'controller-tester', 'active-debug-editor', screen);

      mkdirSync(OUT_DIR, { recursive: true });
      const boxes = { screen: screen.name, idle: idleBox, active: activeBox, debug: debugBox, editor: editorBox, both: bothBox };
      writeFileSync(`${OUT_DIR}tester-panel-boxes-${screen.name}.json`, JSON.stringify(boxes, null, 2));
      test.info().annotations.push({ type: 'tester-panel-boxes', description: JSON.stringify(boxes) });
    });
  });
}

test.describe('screens: pad per label family', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('pad gallery', async ({ page }) => {
    await page.goto('/demo/');
    await page.waitForSelector('#open-btn');
    // Mounting the bindings modal injects the tools stylesheet.
    await openBindings(page);
    const families = await page.evaluate(async () => {
      const [{ createPadView }, { createDomWriter }, { getStickLayoutForFamily }, { padSvgOpenTag }, fx] = await Promise.all([
        import('/src/ui/tools/pad-view.js'),
        import('/src/ui/tools/dom-writer.js'),
        import('/src/ui/tools/pad-layout.js'),
        import('/src/ui/tools/pad-view.js'),
        import('/tests/ui/tools/fixtures/family-labels.js'),
      ]);
      const host = document.createElement('div');
      host.id = 'bm-pad-gallery';
      host.style.cssText = 'position:fixed;inset:0;z-index:20000;background:#0f1a26;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(host);
      window.__bmPadGallery = (family) => {
        host.innerHTML = `<div style="width:1200px;height:860px;display:flex;flex-direction:column;color:#d6ecff;font:600 22px system-ui">
          <div style="height:40px">${family}</div>
          <div style="flex:1;position:relative">${padSvgOpenTag('bm-tester-pad')}</svg></div></div>`;
        const pad = createPadView(host.querySelector('svg'), createDomWriter());
        pad.setLayout(getStickLayoutForFamily(family));
        pad.setLabels(fx.labelFor(family), family);
      };
      return fx.FAMILIES;
    });
    const screen = { name: '1920x1080' };
    for (const family of families) {
      await page.evaluate((f) => window.__bmPadGallery(f), family);
      await shoot(page, 'pad', family, screen);
    }
  });
});
