import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';
import { createFakeManager, createFakePad, installManualRaf } from './helpers.js';

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('closing during a capture cancels it', () => {
  let raf;
  let fake;
  let manager;
  let tools;
  let q;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    raf = installManualRaf();
    fake = createFakePad();
    manager = createFakeManager();
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => [fake.pad, null, null, null] });
    tools = createBuiltInToolsController(manager, { builtInTools: true });
    tools.mount(document.body);
    q = (s) => document.querySelector(`.bm-built-in-tools-root ${s}`);
  });

  afterEach(() => {
    tools?.unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function startTesterCapture() {
    tools.openControllerTest();
    q('.bm-tester-editor-btn').click();
    q('.bm-tester-edit-toggle-btn').click();
    q('.bm-tester-pad [data-code="GP_B3"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    q('.bm-tester-capture-update-btn').click();
    await flush(1100); // baseline
    raf.step(); // the mini modal waits one frame
    await flush(0);
    expect(q('.bm-capture-mini-modal').classList.contains('bm-open')).toBe(true);
    fake.setButton(2, 1);
    await flush(300); // a signal is being scored
  }

  const closers = {
    close: () => q('.bm-tester-close-btn').click(),
    // Escape acts on the topmost dialog: it cancels the capture mini modal, not the tester.
    escape: () => q('.bm-tester-panel').dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })),
    unmount: () => { tools.unmount(); tools = null; },
  };

  for (const [name, closeIt] of Object.entries(closers)) {
    it(`tester capture update: ${name} writes nothing and leaves no timer`, async () => {
      await startTesterCapture();
      closeIt();
      await flush(0);
      expect(vi.getTimerCount()).toBe(0);
      await flush(6000);
      expect(manager.setGamepadProfileMappingEntry).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      if (name !== 'unmount') expect(q('.bm-capture-mini-modal').classList.contains('bm-open')).toBe(false);
    });
  }

  it('tester calibration: close cancels it and leaves no timer', async () => {
    tools.openControllerTest();
    q('.bm-tester-editor-btn').click();
    q('.bm-tester-calibrate-btn').click();
    await flush(200);
    q('.bm-tester-close-btn').click();
    await flush(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Input Remap capture step: close records nothing and leaves no timer', async () => {
    tools.openInputRemap();
    q('.bm-debug-start-btn').click();
    await flush(2100); // baseline
    expect(q('.bm-debug-capture-btn').disabled).toBe(false);
    q('.bm-debug-capture-btn').click();
    raf.step();
    await flush(0);
    fake.setButton(0, 1);
    await flush(300);
    q('.bm-debug-close-btn').click();
    await flush(0);
    expect(vi.getTimerCount()).toBe(0);
    await flush(6000);
    const payload = JSON.parse(q('.bm-debug-results').value);
    expect(payload.runMeta.completedSteps).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Input Remap baseline: close cancels it and leaves no timer', async () => {
    tools.openInputRemap();
    q('.bm-debug-start-btn').click();
    await flush(300);
    q('.bm-debug-close-btn').click();
    await flush(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
