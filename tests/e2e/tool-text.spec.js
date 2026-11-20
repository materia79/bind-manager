/**
 * L1: the built-in tools' text follows the host like the bindings modal's: a
 * --bm-u set on an ancestor (not only :root) and the host font variables
 * --bm-font-xs / -s / -m / -l.
 */
import { test, expect } from '@playwright/test';

/** Blank page with host CSS, the bindings modal and the Controller Test open. */
async function open(page, hostCss) {
  await page.goto('/package.json');
  await page.setContent(`<!doctype html><html><head><style>body { margin: 0; } ${hostCss}</style></head><body></body></html>`);
  await page.evaluate(async () => {
    const { createBindManager } = await import('/src/index.js');
    window.__bm = createBindManager({ namespace: `tooltext-${Math.random()}`, builtInTools: true });
    window.__bm.registerAction({ id: 'jump', label: 'Jump', defaultBindings: ['Space'] });
    window.__bm.open();
    window.__bm.openControllerTest();
  });
  await expect(page.locator('.bm-tester-modal.bm-tester-open')).toBeVisible();
  return page.evaluate(() => {
    const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    return {
      modalL: px('.bm-modal-title'), toolL: px('.bm-tool-title'),
      modalM: px('.bm-modal'), toolM: px('.bm-capture-mini-instruction'),
      toolS: px('.bm-tool-panel'), toolXs: px('.bm-tester-status'),
    };
  });
}

test.describe('tool text follows the host (L1)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('a --bm-u on body changes the tools\' text as it changes the modal\'s', async ({ page }) => {
    const base = await open(page, '');
    expect(base.toolL).toBeCloseTo(base.modalL, 1);
    const scaled = await open(page, 'body { --bm-u: 1px; }');
    expect(scaled.modalL).toBeCloseTo(21, 1);
    expect(scaled.toolL).toBeCloseTo(21, 1);
    expect(scaled.toolM).toBeCloseTo(scaled.modalM, 1);
    expect(scaled.toolL).toBeGreaterThan(base.toolL + 3);
  });

  test('html:root --bm-font-m / -l reach the tools as they reach the modal', async ({ page }) => {
    const sized = await open(page, 'html:root { --bm-font-m: 24px; --bm-font-l: 30px; --bm-font-s: 13px; --bm-font-xs: 11px; }');
    expect(sized.modalM).toBe(24);
    expect(sized.toolM).toBe(24);
    expect(sized.modalL).toBe(30);
    expect(sized.toolL).toBe(30);
    expect(sized.toolS).toBe(13);
  });
});
