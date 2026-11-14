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

/** Where focus is: which dialog holds it and a short description. */
async function focusInfo(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    const where = a === document.body ? 'body'
      : a.closest('.bm-capture-mini-modal') ? 'mini'
        : a.closest('.bm-tester-modal') ? 'tester'
          : a.closest('.bm-debug-modal') ? 'remap'
            : a.closest('.bm-capture-overlay, .bm-capture-modal') ? 'capture'
              : a.closest('.bm-overlay') ? 'bindings'
                : 'other';
    return { where, cls: typeof a.className === 'string' ? a.className : '', footerId: a.dataset?.footerActionId ?? null };
  });
}

const BINDINGS_OPEN = '.bm-overlay[style*="flex"]';

async function openBindingsHarness(page, padSpec = XBOX_SERIES) {
  const pad = await installFakeGamepad(page, padSpec);
  await openHarness(page, { actions: 'few' });
  await pad.connect();
  await page.evaluate(() => window.__bm.open());
  await expect(page.locator('.bm-modal')).toBeVisible();
  return pad;
}

async function tabTimes(page, n, expectedWhere) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
    expect((await focusInfo(page)).where, `Tab ${i + 1}`).toBe(expectedWhere);
  }
}

for (const tool of [
  { id: 'controller-test', modal: '.bm-tester-modal.bm-tester-open', where: 'tester' },
  { id: 'input-debug', modal: '.bm-debug-modal.bm-debug-open', where: 'remap' },
]) {
  test.describe(`J5: focus across the bindings modal and ${tool.id}`, () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('tool from the footer: Tab stays in the tool, close returns to the footer, the modal trap and Escape work', async ({ page }) => {
      await openBindingsHarness(page);
      const footer = page.locator(`.bm-footer-action-btn[data-footer-action-id="${tool.id}"]`);
      await footer.click();
      await expect(page.locator(tool.modal)).toBeVisible();
      expect((await focusInfo(page)).where).toBe(tool.where);
      await tabTimes(page, 30, tool.where);

      await page.locator(`${tool.modal} .bm-tool-close`).click();
      await expect(page.locator(tool.modal)).toHaveCount(0);
      expect(await focusInfo(page)).toMatchObject({ where: 'bindings', footerId: tool.id });
      await tabTimes(page, 30, 'bindings');
      await page.keyboard.press('Escape');
      await expect(page.locator(BINDINGS_OPEN)).toHaveCount(0);
    });

    test('bind capture cancelled, then the tool: focus and Escape work at each step', async ({ page }) => {
      await openBindingsHarness(page);
      for (const device of ['keyboard', 'gamepad']) {
        const slot = page.locator(`.bm-bind-btn[data-action-id="fire"][data-device="${device}"]`);
        await slot.click();
        await expect(page.locator('.bm-capture-modal')).toBeVisible();
        expect((await focusInfo(page)).where, `${device} capture has focus`).toBe('capture');
        await page.keyboard.press('Escape');
        await expect(page.locator('.bm-capture-modal')).toBeHidden();
        await expect(page.locator(BINDINGS_OPEN)).toHaveCount(1);
        expect(await focusInfo(page)).toMatchObject({ where: 'bindings' });
        expect((await focusInfo(page)).cls).toContain('bm-bind-btn');
      }
      const footer = page.locator(`.bm-footer-action-btn[data-footer-action-id="${tool.id}"]`);
      await footer.click();
      await expect(page.locator(tool.modal)).toBeVisible();
      expect((await focusInfo(page)).where).toBe(tool.where);
      await tabTimes(page, 10, tool.where);
      await page.keyboard.press('Escape');
      await expect(page.locator(tool.modal)).toHaveCount(0);
      expect(await focusInfo(page)).toMatchObject({ where: 'bindings', footerId: tool.id });
      await tabTimes(page, 10, 'bindings');
      await page.keyboard.press('Escape');
      await expect(page.locator(BINDINGS_OPEN)).toHaveCount(0);
    });
  });
}

for (const tool of [
  { id: 'controller-test', modal: '.bm-tester-modal.bm-tester-open', where: 'tester' },
  { id: 'input-debug', modal: '.bm-debug-modal.bm-debug-open', where: 'remap' },
]) {
  test.describe(`J6: Escape in ${tool.id} never reaches the bindings modal`, () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('Escape in the tool closes only the tool, also with focus on body', async ({ page }) => {
      await openBindingsHarness(page);
      const footer = page.locator(`.bm-footer-action-btn[data-footer-action-id="${tool.id}"]`);
      await footer.click();
      await expect(page.locator(tool.modal)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(tool.modal)).toHaveCount(0);
      await expect(page.locator(BINDINGS_OPEN)).toHaveCount(1);
      expect(await focusInfo(page)).toMatchObject({ where: 'bindings', footerId: tool.id });

      await footer.click();
      await expect(page.locator(tool.modal)).toBeVisible();
      await page.evaluate(() => document.activeElement.blur());
      expect((await focusInfo(page)).where).toBe('body');
      await page.keyboard.press('Escape');
      await expect(page.locator(tool.modal)).toHaveCount(0);
      await expect(page.locator(BINDINGS_OPEN)).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator(BINDINGS_OPEN)).toHaveCount(0);
    });
  });
}

test.describe('J6: a control that disables itself keeps Escape, Tab and focus working', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  async function expectToolKeysWork(page, modal, where) {
    expect((await focusInfo(page)).where, 'focus stays in the tool').toBe(where);
    await tabTimes(page, 12, where);
    await page.keyboard.press('Escape');
    await expect(page.locator(modal)).toHaveCount(0);
    await expect(page.locator(BINDINGS_OPEN)).toHaveCount(1);
    expect((await focusInfo(page)).where).toBe('bindings');
  }

  test('tester: Calibrate', async ({ page }) => {
    await openBindingsHarness(page);
    await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
    await page.locator('.bm-tester-editor-btn').click();
    const calibrate = page.locator('.bm-tester-calibrate-btn');
    await calibrate.focus();
    await page.keyboard.press('Enter');
    await expect(calibrate).toBeDisabled();
    await frames(page, 3);
    expect((await focusInfo(page)).where).not.toBe('body');
    await expectToolKeysWork(page, '.bm-tester-modal.bm-tester-open', 'tester');
  });

  test('tester: Capture update', async ({ page }) => {
    await openBindingsHarness(page);
    await page.locator('.bm-footer-action-btn[data-footer-action-id="controller-test"]').click();
    await page.locator('.bm-tester-editor-btn').click();
    await page.locator('.bm-tester-edit-toggle-btn').click();
    await page.locator('.bm-tester-pad [data-code="GP_B3"]').click();
    const capture = page.locator('.bm-tester-capture-update-btn');
    await capture.focus();
    await page.keyboard.press('Enter');
    await expect(capture).toBeDisabled();
    await frames(page, 3);
    expect((await focusInfo(page)).where).not.toBe('body');
    // Baseline (1 s), then the capture mini modal takes focus; Escape cancels it only.
    const mini = page.locator('.bm-capture-mini-modal.bm-open');
    await expect(mini).toBeVisible({ timeout: 5000 });
    expect((await focusInfo(page)).where).toBe('mini');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Escape');
    await expect(mini).toHaveCount(0);
    await expect(page.locator('.bm-tester-modal.bm-tester-open')).toHaveCount(1);
    await frames(page, 3);
    await expectToolKeysWork(page, '.bm-tester-modal.bm-tester-open', 'tester');
  });

  test('Input Remap: Start Debug', async ({ page }) => {
    await openBindingsHarness(page);
    await page.locator('.bm-footer-action-btn[data-footer-action-id="input-debug"]').click();
    const start = page.locator('.bm-debug-start-btn');
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(start).toBeDisabled();
    await frames(page, 3);
    expect((await focusInfo(page)).where).not.toBe('body');
    await expectToolKeysWork(page, '.bm-debug-modal.bm-debug-open', 'remap');
  });
});