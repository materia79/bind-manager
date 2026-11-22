/**
 * 0.2.4, the bindings modal in Chromium with 80 actions in 4 groups (one with
 * four slots), at 1280x800 (mouse) and 390x844 (touch phone):
 * - only the list scrolls: a host's scrollIntoView() on a row, focus() on a
 *   button far down, a long footer note and the modal's own Tab wrap leave the
 *   header, the search field and the footer where they are, and the row still
 *   becomes visible inside the list;
 * - in a browser without overflow: clip the box is put back as well.
 * The row layout on the phone is in phone-rows.spec.js.
 */
import { test, expect } from '@playwright/test';

const NOTE = 'Key 1 may not work in every browser. The browser may have its own shortcut on it. Nothing cancels it, and whether it can be cancelled at all is up to each browser.';

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

/** Boxes of the fixed parts, the modal's own scroll offset and whether the last row is inside the list. */
const readout = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const top = (s) => Math.round(q(s).getBoundingClientRect().top);
  const modal = q('.bm-modal');
  const body = q('.bm-modal-body').getBoundingClientRect();
  const last = [...document.querySelectorAll('.bm-action-row')].at(-1).getBoundingClientRect();
  const middle = document.querySelectorAll('.bm-action-row')[40].getBoundingClientRect();
  const inBody = (r) => r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
  return {
    modalScroll: [modal.scrollTop, modal.scrollLeft],
    header: top('.bm-modal-header'), search: top('.bm-search-input'), footer: top('.bm-modal-footer'),
    lastInBody: inBody(last), middleInBody: inBody(middle),
    listScrolled: q('.bm-modal-body').scrollTop > 0,
  };
});

const ACTIONS = {
  'scrollIntoView of the last row': (page) => page.evaluate(() => [...document.querySelectorAll('.bm-action-row')].at(-1).scrollIntoView({ block: 'start' })),
  'scrollIntoView of a middle row (center)': (page) => page.evaluate(() => document.querySelectorAll('.bm-action-row')[40].scrollIntoView({ block: 'center' })),
  'focus() on the last bind button': (page) => page.evaluate(() => [...document.querySelectorAll('.bm-bind-btn')].at(-1).focus()),
  'a long footer note, then the last row into view': async (page) => {
    await page.evaluate((note) => { const w = document.querySelector('.bm-conflict-warning'); w.textContent = note; w.classList.remove('bm-hidden'); }, NOTE);
    await frames(page);
    await page.evaluate(() => [...document.querySelectorAll('.bm-action-row')].at(-1).scrollIntoView({ block: 'start' }));
  },
  'the Tab wrap (Shift+Tab from the first, Tab from the last)': async (page) => {
    await page.evaluate(() => document.querySelector('.bm-close-btn').focus());
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
  },
};

const VIEWPORTS = {
  '1280x800': { viewport: { width: 1280, height: 800 } },
  '390x844 touch': { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
};

for (const [vpName, use] of Object.entries(VIEWPORTS)) {
  test.describe(`modal box at ${vpName}`, () => {
    test.use(use);

    for (const [name, act] of Object.entries(ACTIONS)) {
      test(`only the list scrolls: ${name}`, async ({ page }) => {
        await setup(page);
        if (name.startsWith('a long footer note')) {
          // The note makes the footer taller: compare against the layout with the note
          await page.evaluate((note) => { const w = document.querySelector('.bm-conflict-warning'); w.textContent = note; w.classList.remove('bm-hidden'); }, NOTE);
          await frames(page);
        }
        const before = await readout(page);
        await act(page);
        await frames(page);
        const after = await readout(page);
        expect(after.modalScroll).toEqual([0, 0]);
        expect([after.header, after.search, after.footer]).toEqual([before.header, before.search, before.footer]);
        if (name.includes('last row') || name.includes('last bind')) {
          expect(after.lastInBody).toBe(true);
          expect(after.listScrolled).toBe(true);
        }
        if (name.includes('middle row')) expect(after.middleInBody).toBe(true);
      });
    }

    test('a browser without overflow: clip (hidden instead): the box is put back, the row stays visible in the list', async ({ page }) => {
      await setup(page);
      await page.addStyleTag({ content: '.bm-overlay .bm-modal { overflow: hidden !important; }' });
      const before = await readout(page);
      await page.evaluate(() => [...document.querySelectorAll('.bm-action-row')].at(-1).scrollIntoView({ block: 'start' }));
      await expect.poll(() => page.evaluate(() => document.querySelector('.bm-modal').scrollTop)).toBe(0);
      await frames(page);
      const after = await readout(page);
      expect([after.header, after.search, after.footer]).toEqual([before.header, before.search, before.footer]);
      expect(after.lastInBody).toBe(true);
    });
  });
}
