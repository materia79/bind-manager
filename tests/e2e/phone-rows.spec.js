/**
 * 0.2.4, rows of the bindings modal in Chromium with 80 actions in 4 groups, one
 * of them with four slots: on a phone (390x844, touch) an action with one or two
 * slots keeps its reset button on its line and the four-slot action wraps its
 * own slots without widening the others; at 1280x800 the layout is unchanged.
 */
import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.goto('/package.json');
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <style>html, body { height: 100%; margin: 0; } body { overflow: hidden; background: #333; }</style>
    </head><body></body></html>`);
  await page.evaluate(async () => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace: `box-${Math.random()}` });
    window.__bm = bm;
    const groups = ['Group A', 'Group B', 'Group C', 'Group D'];
    for (let i = 1; i <= 80; i++) {
      const slots = i === 1 ? 4 : 2;
      bm.registerAction({ id: `action-${i}`, label: `Action ${i}`, group: groups[Math.floor((i - 1) / 20)], slots, defaultBindings: Array(slots).fill(null) });
    }
    bm.open();
  });
  await expect(page.locator('.bm-modal')).toBeVisible();
  await frames(page);
}

const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const VIEWPORTS = {
  '1280x800': { viewport: { width: 1280, height: 800 } },
  '390x844 touch': { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};

/** Per row: height, and the reset button and device rows relative to the row. */
const rowBoxes = (page) => page.evaluate(() => [...document.querySelectorAll('.bm-action-row')].map((row) => {
  const r = row.getBoundingClientRect();
  const box = (s) => { const b = row.querySelector(s).getBoundingClientRect(); return { left: b.left - r.left, top: b.top - r.top, width: b.width, bottom: b.bottom - r.top, right: b.right - r.left }; };
  return { id: row.dataset.actionId, height: r.height, width: r.width, reset: box('.bm-action-reset-btn'), kb: box('.bm-device-row--keyboard'), gp: box('.bm-device-row--gamepad'), slot0: box('.bm-slot'), binds: [...row.querySelectorAll('.bm-device-row--keyboard .bm-bind-btn')].map((b) => b.getBoundingClientRect().left - r.left) };
}));

test.describe('rows on a phone (390x844 touch)', () => {
  test.use(VIEWPORTS['390x844 touch']);

  test('one or two slots keep the reset button on the row\'s line; four slots wrap without widening the other rows', async ({ page }) => {
    await setup(page);
    await expect(page.locator('.bm-modal')).toHaveClass(/bm-layout-narrow/);
    const rows = await rowBoxes(page);
    const [four, ...two] = rows;
    for (const row of two) {
      // Beside the device rows, not under them
      expect(row.reset.left).toBeGreaterThan(row.kb.right);
      expect(row.reset.top).toBeLessThan(row.gp.bottom);
      expect(row.reset.right).toBeLessThanOrEqual(row.width);
      expect(row.height).toBe(two[0].height);
      expect(row.kb.width).toBe(two[0].kb.width);
      // Slot columns line up with the four-slot action's
      expect(row.binds).toEqual(four.binds.slice(0, 2));
    }
    // The four-slot action wraps its own slots and stays inside the row
    expect(four.kb.width).toBeGreaterThan(two[0].kb.width);
    expect(four.kb.right).toBeLessThanOrEqual(four.width);
    expect(four.height).toBeGreaterThan(two[0].height);
  });
});

test.describe('rows at 1280x800 (mouse): the desktop layout is unchanged', () => {
  test.use(VIEWPORTS['1280x800']);

  test('every row has the four-slot width, so all columns and reset buttons line up', async ({ page }) => {
    await setup(page);
    const rows = await rowBoxes(page);
    for (const row of rows) {
      expect(row.kb.width).toBe(rows[0].kb.width);
      expect(row.reset.left).toBe(rows[0].reset.left);
      expect(row.height).toBe(rows[0].height);
    }
  });
});
