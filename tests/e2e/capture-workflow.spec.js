/**
 * The capture workflow (C4): Input Remap on the demo page.
 * - The demo's simulated DualSense reports the standard layout: the note shows
 *   when the tool opens, and after a short guided run the validation is the
 *   standard-layout error, not "ready to export".
 * - A raw fake pad (14 buttons, 12 axes, mapping '') still ends "ready to
 *   export"; the whole documented workflow then runs end to end: a full
 *   guided capture, processControllerDefs() on temp directories only, and the
 *   generated profile applies to that raw pad.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installFakeGamepad } from './helpers/fake-gamepad.js';
import { processControllerDefs } from '../../scripts/process-controller-defs.js';
import { isControllerProfileApplicable } from '../../src/input/gamepad-profile-resolver.js';

const REMAP = '.bm-debug-modal.bm-debug-open .bm-debug-panel';
const RAW_DUALSENSE = Object.freeze({ id: '054c-0ce6-DualSense Wireless Controller', mapping: '', buttonCount: 14, axisCount: 12 });
const HAT_NEUTRAL = 1; // the fake clamps axes to [-1, 1]; real Firefox reports 9/7

async function openDemo(page) {
  await page.goto('/demo/');
  await page.waitForSelector('#open-remap-btn');
}

async function fakeInput(page, name, down) {
  await page.dispatchEvent(`#fake-pad [data-fake-input="${name}"]`, down ? 'pointerdown' : 'pointerup', { pointerId: 1, button: 0 });
}

/** Capture the current step: hold `press`, click Capture, wait out the window, release. */
async function captureStep(page, press, release) {
  await press();
  await page.locator('.bm-debug-capture-btn').click();
  await expect(page.locator('.bm-capture-mini-modal.bm-open')).toBeVisible();
  await expect(page.locator('.bm-capture-mini-modal.bm-open')).toHaveCount(0, { timeout: 8000 });
  await release();
}

test.describe('capture workflow on the demo page', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('simulated standard DualSense: the note on open, the validation is the standard-layout error', async ({ page }) => {
    test.setTimeout(45000);
    await openDemo(page);
    await page.locator('#fake-select').selectOption('dualsense');
    await page.locator('#open-remap-btn').click();
    await expect(page.locator(REMAP)).toBeVisible();
    await expect(page.locator('.bm-debug-layout-note')).toBeVisible();
    await expect(page.locator('.bm-debug-layout-note')).toContainText('already reports this controller in the standard layout');

    await page.locator('.bm-debug-start-btn').click();
    await expect(page.locator('.bm-debug-status')).toContainText('Baseline captured', { timeout: 6000 });
    await captureStep(page, () => fakeInput(page, 'b0', true), () => fakeInput(page, 'b0', false));
    await expect(page.locator('.bm-debug-status')).toContainText('Captured: GP_B0');

    const validation = page.locator('.bm-debug-validation');
    await expect(validation).toContainText('already reports this controller in the standard layout');
    await expect(validation).not.toContainText('ready to export');
    await expect(validation).not.toContainText('process_controller_defs');
    const payload = JSON.parse(await page.locator('.bm-debug-results').inputValue());
    expect(payload.runMeta.targetController.mapping).toBe('standard');
    await expect(page.locator('.bm-debug-download-btn')).toBeEnabled();
  });

  test('raw fake pad: no note, and a short guided run ends "ready to export"', async ({ page }) => {
    test.setTimeout(45000);
    const pad = await installFakeGamepad(page, RAW_DUALSENSE);
    await openDemo(page);
    await pad.connect();
    await pad.setAxis(9, HAT_NEUTRAL);
    await page.locator('#open-remap-btn').click();
    await expect(page.locator(REMAP)).toBeVisible();
    await expect(page.locator('.bm-debug-layout-note')).toBeHidden();
    await page.locator('.bm-debug-start-btn').click();
    await expect(page.locator('.bm-debug-status')).toContainText('Baseline captured', { timeout: 6000 });
    await captureStep(page, () => pad.setButton(1, 1), () => pad.setButton(1, 0));
    await expect(page.locator('.bm-debug-status')).toContainText('Captured: GP_B1');
    await expect(page.locator('.bm-debug-validation')).toContainText('ready to export');
    const payload = JSON.parse(await page.locator('.bm-debug-results').inputValue());
    expect(payload.runMeta.targetController).toMatchObject({ mapping: '', buttons: 14, axes: 12 });
  });

  test('raw fake pad: the whole documented workflow makes a profile that applies to it', async ({ page }) => {
    test.setTimeout(300000);
    const pad = await installFakeGamepad(page, RAW_DUALSENSE);
    await openDemo(page);
    await pad.connect();
    await pad.setAxis(9, HAT_NEUTRAL);
    await page.locator('#open-remap-btn').click();
    await expect(page.locator(REMAP)).toBeVisible();
    await expect(page.locator('.bm-debug-layout-note')).toBeHidden();

    await page.locator('.bm-debug-start-btn').click();
    await expect(page.locator('.bm-debug-status')).toContainText('Baseline captured', { timeout: 6000 });

    // Raw inputs per step, in the layout of the shipped 054c-0ce6 capture.
    const button = (i) => [() => pad.setButton(i, 1), () => pad.setButton(i, 0)];
    const axis = (i, v, rest = 0) => [() => pad.setAxis(i, v), () => pad.setAxis(i, rest)];
    const steps = {
      GP_B0: button(1), GP_B1: button(2), GP_B2: button(0), GP_B3: button(3),
      GP_B4: button(4), GP_B5: button(5), GP_B6: button(6), GP_B6A: axis(3, 1), GP_B7: button(7), GP_B7A: axis(4, 1),
      GP_B8: button(8), GP_B9: button(9), GP_B10: button(10), GP_B11: button(11),
      GP_B12: axis(9, -1, HAT_NEUTRAL), GP_B13: axis(9, 0.142857, HAT_NEUTRAL), GP_B14: axis(9, 0.714286, HAT_NEUTRAL), GP_B15: axis(9, -0.428571, HAT_NEUTRAL),
      GP_B16: button(12),
      GP_A0N: axis(0, -1), GP_A0P: axis(0, 1), GP_A1N: axis(1, -1), GP_A1P: axis(1, 1),
      GP_A2N: axis(2, -1), GP_A2P: axis(2, 1), GP_A3N: axis(5, -1), GP_A3P: axis(5, 1),
    };
    const progress = page.locator('.bm-debug-progress');
    for (let n = 0; ; n++) {
      const text = await progress.textContent();
      const m = text.match(/^Step (\d+)\/(\d+): (.+)$/);
      expect(m, text).not.toBeNull();
      const payloadNow = JSON.parse(await page.locator('.bm-debug-results').inputValue());
      const code = payloadNow.sequence[Number(m[1]) - 1].expectedCode;
      if (steps[code]) await captureStep(page, ...steps[code]);
      if (Number(m[1]) === Number(m[2])) break;
      await page.locator('.bm-debug-next-btn').click();
    }

    // A hat D-pad (all four directions on axis 9) gives the documented D-pad warning;
    // the generator turns it into hat entries. Never the standard-layout error.
    const validation = page.locator('.bm-debug-validation');
    await expect(validation).toContainText(/ready to export|D-Pad mappings are not distinct enough/);
    await expect(validation).not.toContainText('standard layout');
    const payload = JSON.parse(await page.locator('.bm-debug-results').inputValue());
    expect(payload.runMeta.targetController).toMatchObject({ mapping: '', buttons: 14, axes: 12 });
    expect(payload.runMeta.completedSteps).toBe(27);

    // The documented next step, on temp directories only.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-workflow-'));
    try {
      const ws = { capturesDir: path.join(dir, 'captures'), defsDir: path.join(dir, 'profiles'), outFile: path.join(dir, 'index.js') };
      fs.mkdirSync(ws.capturesDir);
      fs.writeFileSync(path.join(ws.capturesDir, '054c-0ce6_dualsense.json'), JSON.stringify(payload, null, 2));
      const result = processControllerDefs({ ...ws, log: () => {} });
      expect(result.errors).toEqual([]);
      const profile = result.definitions.find((d) => d.key === '054c-0ce6');
      expect(profile).toMatchObject({ sourceButtons: 14, sourceAxes: 12 });
      expect(profile.mapping.GP_B0).toEqual({ kind: 'button', index: 1 });
      expect(profile.mapping.GP_B12).toMatchObject({ kind: 'hat', index: 9 });
      const rawPad = { id: RAW_DUALSENSE.id, mapping: '', buttons: new Array(14).fill({}), axes: new Array(12).fill(0) };
      expect(isControllerProfileApplicable(profile, rawPad)).toBe(true);
      expect(isControllerProfileApplicable(profile, { ...rawPad, mapping: 'standard' })).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
