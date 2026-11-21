/**
 * Measurement, not a gate: 400 actions in 16 groups, the time from open() to a
 * rendered modal and the time of one keystroke in the search field, at normal
 * speed and with 4x CPU throttling (a stand-in for a phone). Runs only with
 * BM_PERF=1; prints one JSON line per case. BM_PERF_BASE_DIR, a folder holding
 * another version's src/ (for example 0.2.1 from git archive), measures open()
 * on that version as well.
 *
 *   BM_PERF=1 BM_PERF_BASE_DIR=<dir> npx playwright test tests/e2e/perf-many-rows.spec.js --workers=1
 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RUNS = 7;
const BASE_DIR = process.env.BM_PERF_BASE_DIR || '';

test.skip(!process.env.BM_PERF, 'measurement only: set BM_PERF=1');
test.use({ viewport: { width: 1920, height: 1080 } });

const actions = (folded) => ({
  groups: Array.from({ length: 16 }, (_, g) => `Group ${g + 1}`),
  folded,
});

async function setup(page, { src = '/src/index.js', folded = [], throttle = 1 } = {}) {
  if (BASE_DIR) {
    await page.route('**/perf-base/src/**', async (route) => {
      const rel = new URL(route.request().url()).pathname.replace(/^\/perf-base\//, '');
      const body = await readFile(path.join(BASE_DIR, rel));
      await route.fulfill({ body, contentType: 'text/javascript' });
    });
  }
  await page.goto('/package.json');
  await page.setContent('<!doctype html><html><head></head><body style="margin:0"></body></html>');
  await page.evaluate(async ({ src, groups, folded }) => {
    const { createBindManager } = await import(src);
    const bm = createBindManager({ namespace: `perf-${Math.random()}`, storage: { load: () => null, save() {} }, collapsedGroups: folded });
    const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const defs = [];
    for (let i = 0; i < 400; i++) {
      const group = groups[i % groups.length];
      // Most rows unbound, like a spell book; every eighth row has a key and a pad button
      const bound = i % 8 === 0;
      defs.push({
        id: `spell-${i}`, label: `Spell ${i + 1}`, description: `Casts spell number ${i + 1}`, group, slots: 2, gamepadSlots: 1,
        defaultBindings: bound ? [`Key${keys[(i / 8) % 26 | 0]}`, null] : [null, null],
        defaultGamepadBindings: bound ? [`GP_B${(i / 8) % 16 | 0}`] : [null],
      });
    }
    bm.registerActions(defs);
    window.__bm = bm;
  }, { src, ...actions(folded) });
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
}

/** open() until two frames later (layout and paint done), median of RUNS. */
async function timeOpen(page) {
  return page.evaluate(async (runs) => {
    const times = [];
    for (let i = 0; i < runs; i++) {
      window.__bm.close();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const t0 = performance.now();
      window.__bm.open();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { median: times[runs >> 1], min: times[0], max: times[runs - 1] };
  }, RUNS);
}

/** One keystroke in the field (input event to the next painted frame), median of RUNS. */
async function timeKeystroke(page) {
  return page.evaluate(async (runs) => {
    const input = document.querySelector('.bm-search-input');
    if (!input) return null;
    input.focus();
    const times = [];
    for (let i = 0; i < runs; i++) {
      for (const value of ['spell 1', 'spell 12']) {
        const t0 = performance.now();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (value === 'spell 12') times.push(performance.now() - t0);
      }
    }
    times.sort((a, b) => a - b);
    return { median: times[runs >> 1], min: times[0], max: times[runs - 1] };
  }, RUNS);
}

for (const throttle of [1, 4]) {
  test(`400 actions in 16 groups, CPU x${throttle}`, async ({ page }) => {
    const results = {};
    await setup(page, { throttle });
    results.open = await timeOpen(page);
    results.keystroke = await timeKeystroke(page);
    expect(await page.locator('.bm-action-row').count()).toBe(400);

    await page.close();
    const folded = await page.context().newPage();
    await setup(folded, { throttle, folded: actions([]).groups });
    results.openAllFolded = await timeOpen(folded);
    results.keystrokeAllFolded = await timeKeystroke(folded);

    if (BASE_DIR) {
      const base = await page.context().newPage();
      await setup(base, { throttle, src: '/perf-base/src/index.js' });
      results.openBase = await timeOpen(base);
    }
    console.log(`PERF ${JSON.stringify({ throttle, runs: RUNS, ...results })}`);
  });
}
