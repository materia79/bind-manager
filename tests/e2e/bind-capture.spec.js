import { test, expect } from '@playwright/test';

test.describe('Bind Manager Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/');
    // Wait for the demo to initialize
    await page.waitForSelector('#open-btn');
  });

  test('opens and closes the binding modal', async ({ page }) => {
    const openBtn = page.locator('#open-btn');
    await openBtn.click();

    // Modal should be visible
    const modal = page.locator('.bm-modal');
    await expect(modal).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('modal shows registered actions', async ({ page }) => {
    await page.locator('#open-btn').click();
    const modal = page.locator('.bm-modal');
    await expect(modal).toBeVisible();

    // Should contain at least one action row
    const rows = modal.locator('.bm-action-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a binding slot starts capture', async ({ page }) => {
    await page.locator('#open-btn').click();
    await page.waitForSelector('.bm-modal');

    // Click the first binding slot button
    const slot = page.locator('.bm-bind-btn').first();
    await slot.click();

    // Capture modal should appear
    const captureModal = page.locator('.bm-capture-modal');
    await expect(captureModal).toBeVisible();
  });

  test('capture accepts a key press and updates binding', async ({ page }) => {
    await page.locator('#open-btn').click();
    await page.waitForSelector('.bm-modal');

    // Click the first binding slot to start capture
    const slot = page.locator('.bm-bind-btn').first();
    await slot.click();
    await page.waitForSelector('.bm-capture-modal');

    // Press a key to bind (press dispatches keydown+keyup)
    await page.keyboard.press('z');

    // Capture modal should close
    const captureModal = page.locator('.bm-capture-modal');
    await expect(captureModal).not.toBeVisible({ timeout: 3000 });
  });

  test('cancel button in capture closes capture modal', async ({ page }) => {
    await page.locator('#open-btn').click();
    await page.waitForSelector('.bm-modal');

    const slot = page.locator('.bm-bind-btn').first();
    await slot.click();
    await page.waitForSelector('.bm-capture-modal');

    // Click cancel (fires on pointerdown)
    const cancelBtn = page.locator('.bm-capture-cancel-btn');
    await cancelBtn.click();

    const captureModal = page.locator('.bm-capture-modal');
    await expect(captureModal).not.toBeVisible({ timeout: 3000 });
  });

  test('F5 debug key toggles modal', async ({ page }) => {
    await page.keyboard.press('F5');
    const modal = page.locator('.bm-modal');
    await expect(modal).toBeVisible({ timeout: 3000 });

    await page.keyboard.press('F5');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
