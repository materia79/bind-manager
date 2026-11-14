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
const TOOL_SCREENS = [...SCREENS, { name: '1000x600', width: 1000, height: 600 }, { name: '390x844', width: 390, height: 844 }, { name: '820x1180', width: 820, height: 1180 }];

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

      // Capture mini modal with a live signal
      await panel.locator('.bm-debug-capture-btn').click();
      const mini = page.locator('.bm-capture-mini-modal.bm-open .bm-capture-mini-panel');
      await expect(mini.locator('.bm-capture-mini-live-state')).toHaveText('Strongest signal');
      await shoot(page, 'capture-mini', 'active', screen);
      await mini.locator('.bm-capture-mini-cancel-btn').click();
      await expect(mini).toBeHidden();
    });

    test('controller tester without a controller', async ({ page }) => {
      await installFakeGamepad(page, DUALSENSE_CHROME);
      await page.goto('/demo/');
      await page.waitForSelector('#open-btn');
      await openBindings(page);
      await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
      const panel = page.locator('.bm-tester-modal.bm-tester-open .bm-tester-panel');
      await expect(panel.locator('.bm-pad-message')).toBeVisible();
      await shoot(page, 'controller-tester', 'nopad', screen);
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

      // (f) both, edit mode: GP_B3 selected and assigned, its binding row listed
      await pad.reset();
      await panel.locator('.bm-tester-edit-toggle-btn').click();
      await panel.locator('.bm-tester-pad [data-code="GP_B3"]').click();
      await pad.setButton(2, 1);
      await expect(panel.locator('.bm-tester-edit-status')).toHaveText(/^Updated GP_B3/);
      await pad.reset();
      await panel.locator('.bm-tester-binding-item').first().scrollIntoViewIfNeeded();
      await shoot(page, 'controller-tester', 'edit-debug-editor', screen);

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
      const [{ createPadView }, { createDomWriter }, { getStickLayoutForFamily }, { padSvgOpenTag }, profiles] = await Promise.all([
        import('/src/ui/tools/pad-view.js'),
        import('/src/ui/tools/dom-writer.js'),
        import('/src/ui/tools/pad-layout.js'),
        import('/src/ui/tools/pad-view.js'),
        import('/src/input/gamepad-profiles.js'),
      ]);
      // Real family labels (and label variants); a generic pad has the 17 standard buttons.
      const entries = [
        ...profiles.GAMEPAD_FAMILIES.map((family) => [family, family, null]),
        ...Object.entries(profiles.GAMEPAD_LABEL_VARIANTS).map(([variant, def]) => [variant, def.family, variant]),
      ];
      const byName = Object.fromEntries(entries.map(([name, family, variant]) => [name, { family, variant }]));
      const host = document.createElement('div');
      host.id = 'bm-pad-gallery';
      host.style.cssText = 'position:fixed;inset:0;z-index:20000;background:#0f1a26;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(host);
      window.__bmPadGallery = (name) => {
        const { family, variant } = byName[name];
        host.innerHTML = `<div style="width:1200px;height:860px;display:flex;flex-direction:column;color:#d6ecff;font:600 22px system-ui">
          <div style="height:40px">${name}</div>
          <div style="flex:1;position:relative">${padSvgOpenTag('bm-tester-pad')}</svg></div></div>`;
        const pad = createPadView(host.querySelector('svg'), createDomWriter());
        pad.setLayout(getStickLayoutForFamily(family), { b17InRow: !!variant });
        const hasCode = family === 'generic' ? (code) => Number(code.slice(4)) < 17 : null;
        pad.setLabels((code) => profiles.getGamepadLabel(code, family, variant), family, hasCode);
      };
      return Object.keys(byName);
    });
    const screen = { name: '1920x1080' };
    for (const family of families) {
      await page.evaluate((f) => window.__bmPadGallery(f), family);
      await shoot(page, 'pad', family, screen);
    }
  });
});

/** Realistic fake pads per family (Chrome ids, standard mapping), button counts as the pads report them. */
const FAMILY_PADS = [
  { name: 'xbox', id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)', buttonCount: 18 },
  { name: 'xbox-elite', id: 'Xbox Elite Wireless Controller Series 2 (STANDARD GAMEPAD Vendor: 045e Product: 0b00)', buttonCount: 21 },
  { name: 'dualshock4', id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', buttonCount: 18 },
  { name: 'dualsense', id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', buttonCount: 18 },
  { name: 'switch-pro', id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', buttonCount: 18 },
  { name: 'steam', id: 'Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)', buttonCount: 24 },
  { name: 'stadia', id: 'Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)', buttonCount: 19 },
  { name: 'generic', id: 'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)', buttonCount: 17 },
];

test.describe('screens: Controller Tester per family (real manager)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const fam of FAMILY_PADS) {
    test(`tester ${fam.name}`, async ({ page }) => {
      const pad = await installFakeGamepad(page, { id: fam.id, mapping: 'standard', buttonCount: fam.buttonCount, axisCount: 4 });
      await page.goto('/package.json');
      await page.setContent('<!doctype html><html><head><style>body { margin: 0; background: #0b1020; }</style></head><body></body></html>');
      await page.evaluate(async () => {
        const { createBindManager } = await import('/src/index.js');
        window.__bm = createBindManager({ namespace: `screens-family-${Math.random()}`, builtInTools: true });
        window.__bm.registerAction({ id: 'jump', label: 'Jump', defaultBindings: ['Space'], defaultGamepadBindings: ['GP_B0'] });
      });
      await pad.connect();
      await page.evaluate(() => window.__bm.open());
      await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
      const panel = page.locator('.bm-tester-modal.bm-tester-open .bm-tester-panel');
      await expect(panel.locator('select').first()).toBeEnabled();
      // Face button 0, right bumper and the highest button the pad has, so the pad shows highlights.
      await pad.setButtons({ 0: 1, 5: 1, [fam.buttonCount - 1]: 1 });
      await expect.poll(() => panel.locator('.bm-pad-el.bm-active').count()).toBeGreaterThanOrEqual(2);
      await shoot(page, 'tester-family', fam.name, { name: '1920x1080' });
    });
  }
});