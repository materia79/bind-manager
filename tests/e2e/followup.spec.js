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


test.describe('F5: one tool open at a time', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const [first, second] of [['openControllerTest', 'openInputRemap'], ['openInputRemap', 'openControllerTest']]) {
    test(`${first}() then ${second}(): only the second is open, has focus, and Escape closes it`, async ({ page }) => {
      const pad = await installFakeGamepad(page, XBOX_SERIES);
      await openHarness(page);
      await pad.connect();
      await page.evaluate((m) => window.__bm[m](), first);
      await page.evaluate((m) => window.__bm[m](), second);
      const tester = page.locator('.bm-tester-modal.bm-tester-open');
      const remap = page.locator('.bm-debug-modal.bm-debug-open');
      const [open, closed] = second === 'openInputRemap' ? [remap, tester] : [tester, remap];
      await expect(open).toHaveCount(1);
      await expect(closed).toHaveCount(0);
      expect(await page.evaluate((sel) => !!document.activeElement.closest(sel), second === 'openInputRemap' ? '.bm-debug-modal' : '.bm-tester-modal')).toBe(true);
      await page.keyboard.press('Escape');
      await expect(open).toHaveCount(0);
      await expect(closed).toHaveCount(0);
    });
  }
});

test.describe('F9: scroll cues and the Active line', () => {
  async function openTesterWith(page, size) {
    await page.setViewportSize(size);
    const pad = await installFakeGamepad(page, XBOX_SERIES);
    await openHarness(page);
    await pad.connect();
    await openTesterDirect(page);
    await frames(page, 2);
    return pad;
  }
  const cue = (page, sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return { start: el.classList.contains('bm-fade-start'), end: el.classList.contains('bm-fade-end'), scrolls: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1, gutter: el.offsetWidth - el.clientWidth };
  }, sel);

  test('(d) both side panels: the overflowing side column shows its scrollbar and fades at the cut edge', async ({ page }) => {
    await openTesterWith(page, { width: 1920, height: 1080 });
    await page.locator('.bm-tester-debug-btn').click();
    await page.locator('.bm-tester-editor-btn').click();
    await frames(page, 2);
    const atTop = await cue(page, '.bm-tester-side');
    expect(atTop.scrolls).toBe(true);
    expect(atTop.gutter).toBeGreaterThan(0);
    expect(atTop).toMatchObject({ start: false, end: true });
    const thumb = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText?.includes('.bm-tester-side::-webkit-scrollbar-thumb')) return rule.style.background || rule.style.backgroundColor;
        }
      }
      return null;
    });
    expect(thumb).toMatch(/rgba\(150, 190, 220/);
    await page.evaluate(() => { const s = document.querySelector('.bm-tester-side'); s.scrollTop = s.scrollHeight; });
    await frames(page, 2);
    expect(await cue(page, '.bm-tester-side')).toMatchObject({ start: true, end: false });
  });

  test('(e) a long Active line wraps to two lines before it is cut', async ({ page }) => {
    const pad = await openTesterWith(page, { width: 1280, height: 720 });
    await page.locator('.bm-tester-debug-btn').click();
    await pad.setButtons({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 8: 1, 9: 1, 12: 1, 15: 1 });
    await pad.setAxes({ 0: -1, 1: -1, 2: 1, 3: 1 });
    await frames(page, 3);
    const lines = await page.evaluate(() => {
      const el = document.querySelector('.bm-tester-active-codes');
      const range = document.createRange();
      range.selectNodeContents(el);
      const box = el.getBoundingClientRect();
      const tops = new Set([...range.getClientRects()].filter((r) => r.bottom <= box.bottom + 0.5).map((r) => Math.round(r.top)));
      return { visibleLines: tops.size, clamp: getComputedStyle(el).webkitLineClamp, overflowing: el.scrollHeight > el.clientHeight + 1 };
    });
    expect(lines.clamp).toBe('2');
    expect(lines.visibleLines).toBe(2);
  });

  test('(f) at 390x844 the sideways pad starts centred and fades at the cut edges', async ({ page }) => {
    await openTesterWith(page, { width: 390, height: 844 });
    const pos = await page.evaluate(() => {
      const w = document.querySelector('.bm-tester-pad-wrap');
      return { left: w.scrollLeft, centre: (w.scrollWidth - w.clientWidth) / 2 };
    });
    expect(pos.centre).toBeGreaterThan(10);
    expect(Math.abs(pos.left - pos.centre)).toBeLessThanOrEqual(2);
    expect(await cue(page, '.bm-tester-pad-wrap')).toMatchObject({ start: true, end: true });
    await page.evaluate(() => { document.querySelector('.bm-tester-pad-wrap').scrollLeft = 0; });
    await frames(page, 2);
    expect(await cue(page, '.bm-tester-pad-wrap')).toMatchObject({ start: false, end: true });
  });
});