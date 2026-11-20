/**
 * Final check m3: Input Remap's JSON follows the pad at the tool's index. It
 * re-renders when that pad connects, disconnects or changes id, also before
 * Start Debug. A different pad after the baseline makes the old pad's
 * baseline and captured steps stale: the tool says so, discards them and
 * needs a new baseline before the next capture.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';
import { createFakeManager, createFakePad, installManualRaf } from './helpers.js';

const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';

describe('Input Remap follows the pad (m3)', () => {
  let raf;
  let tools;
  let fake;
  let slot;
  let q;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    raf = installManualRaf();
    fake = createFakePad();
    slot = null; // what sits at index 0
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => [slot, null, null, null] });
    tools = createBuiltInToolsController(createFakeManager(), { builtInTools: true });
    tools.mount(document.body);
    q = (s) => document.querySelector(`.bm-built-in-tools-root ${s}`);
  });

  afterEach(() => {
    tools?.unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const payload = () => JSON.parse(q('.bm-debug-results').value);
  const validation = () => q('.bm-debug-validation').textContent;
  const status = () => q('.bm-debug-status').textContent;
  const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

  /** The same slot, now holding an 18-button Xbox pad. */
  function swapToXbox() {
    const xbox = createFakePad({ buttons: 17 });
    xbox.pad.id = XBOX_ID;
    slot = xbox.pad;
    return xbox;
  }

  async function captureStep(button) {
    q('.bm-debug-capture-btn').click();
    raf.step(); // the mini modal waits one frame
    await flush(0);
    fake.setButton(button, 1);
    await flush(5100);
    fake.setButton(button, 0);
  }

  it('a pad connected while the tool is open, before Start Debug, is in the JSON at once (next frame)', () => {
    tools.openInputRemap();
    expect(payload().runMeta.targetController).toBeNull();
    expect(validation()).toMatch(/Missing targetController/);
    slot = fake.pad;
    raf.step();
    expect(payload().runMeta.targetController).toMatchObject({ index: 0, id: fake.pad.id, buttons: 18, axes: 4 });
    expect(validation()).not.toMatch(/Missing targetController/);
  });

  it('the connect and disconnect events re-render it too', () => {
    tools.openInputRemap();
    slot = fake.pad;
    window.dispatchEvent(new Event('bm-gamepad-connected'));
    expect(payload().runMeta.targetController?.id).toBe(fake.pad.id);
    slot = null;
    window.dispatchEvent(new Event('bm-gamepad-disconnected'));
    expect(payload().runMeta.targetController).toBeNull();
  });

  it('a pad swapped before any baseline: the JSON names the new pad', () => {
    slot = fake.pad;
    tools.openInputRemap();
    swapToXbox();
    raf.step();
    expect(payload().runMeta.targetController).toMatchObject({ id: XBOX_ID, buttons: 17 });
  });

  it('a pad swapped after the baseline: says so, discards the old baseline and steps, needs a new baseline', async () => {
    slot = fake.pad;
    tools.openInputRemap();
    q('.bm-debug-start-btn').click();
    await flush(2100);
    expect(status()).toMatch(/^Baseline captured/);
    await captureStep(0);
    expect(payload().runMeta.completedSteps).toBe(1);
    expect(payload().runMeta.baseline.buttons).toHaveLength(18);

    swapToXbox();
    raf.step();
    expect(status()).toMatch(/controller changed/i);
    expect(status()).toMatch(/1 captured step/);
    expect(status()).toMatch(/Start Debug/);
    const p = payload();
    expect(p.runMeta.targetController).toMatchObject({ id: XBOX_ID, buttons: 17 });
    expect(p.runMeta.baseline).toBeNull();
    expect(p.runMeta.completedSteps).toBe(0);
    expect(p.captures.every((row) => row.detected === null)).toBe(true);
    expect(q('.bm-debug-capture-btn').disabled).toBe(true);

    // a new baseline is taken from the new pad
    q('.bm-debug-start-btn').click();
    await flush(2100);
    expect(payload().runMeta.baseline.buttons).toHaveLength(17);
    expect(q('.bm-debug-capture-btn').disabled).toBe(false);
  });

  it('a pad swapped during a capture step cancels it and records nothing', async () => {
    slot = fake.pad;
    tools.openInputRemap();
    q('.bm-debug-start-btn').click();
    await flush(2100);
    q('.bm-debug-capture-btn').click();
    raf.step();
    await flush(0);
    fake.setButton(0, 1);
    await flush(300);
    swapToXbox();
    raf.step();
    await flush(6000);
    expect(q('.bm-capture-mini-modal').classList.contains('bm-open')).toBe(false);
    expect(payload().runMeta.completedSteps).toBe(0);
    expect(payload().runMeta.baseline).toBeNull();
    expect(q('.bm-debug-start-btn').disabled).toBe(false);
  });

  it('the same pad disconnecting and coming back keeps the baseline and the steps', async () => {
    slot = fake.pad;
    tools.openInputRemap();
    q('.bm-debug-start-btn').click();
    await flush(2100);
    await captureStep(1);
    slot = null;
    raf.step();
    expect(payload().runMeta.targetController).toBeNull();
    expect(status()).toMatch(/disconnected/);
    slot = fake.pad;
    raf.step();
    expect(payload().runMeta.targetController?.id).toBe(fake.pad.id);
    expect(payload().runMeta.baseline).not.toBeNull();
    expect(payload().runMeta.completedSteps).toBe(1);
  });
});
