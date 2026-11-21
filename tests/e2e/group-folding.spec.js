/**
 * 0.2.2: foldable groups in the bindings modal, in a real browser: mouse,
 * touch and keyboard (Enter, Space), the remembered state across a reload,
 * the host's collapsedGroups, the search over folded groups, and focus.
 */
import { test, expect } from '@playwright/test';

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `spell-${i}`, label: `Spell ${i + 1}`, group: 'Spells', slots: 1, defaultBindings: [i < 3 ? `Digit${i + 1}` : null] })),
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

async function setup(page, { namespace = `fold-e2e-${Math.random()}`, reuse = false, ...options } = {}) {
  if (!reuse) await page.goto('/package.json');
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#0b1020"></body></html>');
  await page.evaluate(async ({ actions, namespace, options }) => {
    const { createBindManager } = await import('/src/index.js');
    const bm = createBindManager({ namespace, ...options });
    window.__bm = bm;
    bm.registerActions(actions);
    bm.open();
  }, { actions: ACTIONS, namespace, options });
  await expect(page.locator('.bm-modal')).toBeVisible();
  return namespace;
}

const header = (page, group) => page.locator(`.bm-group-toggle[data-group="${group}"]`);
const visibleRows = (page) => page.evaluate(() => [...document.querySelectorAll('.bm-action-row')]
  .filter((row) => row.offsetParent !== null).map((row) => row.dataset.actionId));

test.describe('group folding', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('click, Enter and Space fold and unfold; the header keeps the focus and shows bound / total', async ({ page }) => {
    await setup(page);
    const spells = header(page, 'Spells');
    await expect(spells).toHaveAttribute('aria-expanded', 'true');
    await expect(spells.locator('.bm-group-count-short')).toHaveText('3 / 12');
    await spells.click();
    await expect(spells).toHaveAttribute('aria-expanded', 'false');
    expect(await visibleRows(page)).toEqual(['jump', 'forward', 'map']);
    await expect(spells).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(spells).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(spells).toHaveAttribute('aria-expanded', 'false');
    // The marker turns; the folded header still tells the count
    await expect(spells.locator('.bm-group-count-short')).toHaveText('3 / 12');
    const transform = await spells.locator('.bm-group-marker').evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe('none');
  });

  test('Tab skips the rows of a folded group, and the trap wraps over what is shown', async ({ page }) => {
    await setup(page, { collapsedGroups: ['Spells'] });
    await page.locator('.bm-close-btn').focus();
    const seen = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => document.activeElement.dataset.actionId ?? document.activeElement.className.split(' ')[0]));
    }
    expect(seen.some((entry) => String(entry).startsWith('spell-'))).toBe(false);
    expect(seen).toContain('bm-close-btn');
    expect(seen.filter((entry) => entry === 'bm-group-title').length).toBeGreaterThanOrEqual(3);
  });

  test('the fold state survives a reload in its own storage key; the bindings key is unchanged', async ({ page }) => {
    const namespace = await setup(page, { collapsedGroups: ['System'] });
    const bindingsBefore = await page.evaluate((ns) => localStorage.getItem(`bind-manager:${ns}`), namespace);
    await header(page, 'Spells').click();
    await header(page, 'System').click();
    const stored = await page.evaluate((ns) => ({
      folds: localStorage.getItem(`bind-manager:${ns}:collapsed-groups`),
      bindings: localStorage.getItem(`bind-manager:${ns}`),
    }), namespace);
    expect(stored.folds).toBe('{"version":2,"groups":[["Spells",true],["System",false]]}');
    expect(stored.bindings).toBe(bindingsBefore);
    await page.reload();
    await setup(page, { namespace, reuse: true, collapsedGroups: ['System'] });
    await expect(header(page, 'Spells')).toHaveAttribute('aria-expanded', 'false');
    await expect(header(page, 'System')).toHaveAttribute('aria-expanded', 'true');
    await expect(header(page, 'Movement')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a search opens folded groups; a header click during it lasts for that search; clearing restores', async ({ page }) => {
    await setup(page, { collapsedGroups: ['Spells'] });
    const field = page.locator('.bm-search-input');
    await field.click();
    await page.keyboard.type('spell 1');
    expect(await visibleRows(page)).toEqual(['spell-0', 'spell-9', 'spell-10', 'spell-11']);
    await expect(header(page, 'Spells')).toHaveAttribute('aria-expanded', 'true');
    await header(page, 'Spells').click();
    expect(await visibleRows(page)).toEqual([]);
    await expect(header(page, 'Spells')).toBeVisible();
    await field.click();
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await expect(header(page, 'Spells')).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => window.__bm.isGroupCollapsed('Spells'))).toBe(true);
    // Unfolding during a search left the remembered state alone
    await page.keyboard.type('spell');
    await expect(header(page, 'Spells')).toHaveAttribute('aria-expanded', 'true');
  });

  test('the count follows a rebind in place; headers are disabled during a capture', async ({ page }) => {
    await setup(page);
    const spells = header(page, 'Spells');
    const handle = await spells.elementHandle();
    await page.locator('.bm-bind-btn[data-action-id="spell-5"][data-device="keyboard"]').click();
    await expect(page.locator('.bm-group-toggle').first()).toBeDisabled();
    expect(await page.locator('.bm-group-toggle:not([disabled])').count()).toBe(0);
    await page.keyboard.press('KeyK');
    await expect(spells.locator('.bm-group-count-short')).toHaveText('4 / 12');
    expect(await handle.evaluate((el) => el.isConnected)).toBe(true);
    await expect(page.locator('.bm-group-toggle').first()).toBeEnabled();
  });

  test('the header fits every row layout', async ({ page }) => {
    for (const [size, layout] of [[{ width: 1920, height: 1080 }, 'bm-layout-inline'], [{ width: 520, height: 900 }, 'bm-layout-stacked'], [{ width: 390, height: 844 }, 'bm-layout-narrow']]) {
      await page.setViewportSize(size);
      await setup(page);
      await expect(page.locator('.bm-modal')).toHaveClass(new RegExp(layout));
      const box = await page.evaluate(() => {
        const btn = document.querySelector('.bm-group-toggle[data-group="Spells"]');
        const group = btn.closest('.bm-group').getBoundingClientRect();
        const r = btn.getBoundingClientRect();
        const count = btn.querySelector('.bm-group-count').getBoundingClientRect();
        return { left: r.left, right: r.right, groupLeft: group.left, groupRight: group.right, countRight: count.right, overflow: btn.scrollWidth - btn.clientWidth };
      });
      expect(box.left, layout).toBeCloseTo(box.groupLeft, 0);
      expect(box.right, layout).toBeCloseTo(box.groupRight, 0);
      expect(box.countRight, layout).toBeLessThanOrEqual(box.right);
      expect(box.overflow, layout).toBeLessThanOrEqual(0);
    }
  });

  test('groupFolding: false with bindSearch: false renders the plain 0.2.1 group titles', async ({ page }) => {
    await setup(page, { groupFolding: false, bindSearch: false, collapsedGroups: ['Spells'] });
    expect(await page.locator('.bm-group-toggle, .bm-group-rows, .bm-search').count()).toBe(0);
    expect(await page.locator('div.bm-group-title').count()).toBe(3);
    expect((await visibleRows(page)).length).toBe(ACTIONS.length);
  });
});

test.describe('group folding on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('a tap folds and unfolds', async ({ page }) => {
    await setup(page);
    await header(page, 'Spells').tap();
    await expect(header(page, 'Spells')).toHaveAttribute('aria-expanded', 'false');
    await header(page, 'Spells').tap();
    await expect(header(page, 'Spells')).toHaveAttribute('aria-expanded', 'true');
  });
});
