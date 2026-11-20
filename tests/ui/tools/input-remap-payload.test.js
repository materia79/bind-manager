/**
 * F11: Input Remap's JSON follows the guided flow: with a pad connected it
 * names the target controller as soon as the tool opens, and after Start
 * Debug it carries the captured baseline (it was rendered once at mount,
 * with no pad, and never again until a step was captured).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';
import { createFakeManager, createFakePad, installManualRaf } from './helpers.js';

describe('Input Remap payload (F11)', () => {
  let tools;
  let fake;
  let q;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    installManualRaf();
    fake = createFakePad();
    let connected = false;
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => [connected ? fake.pad : null, null, null, null] });
    // Mounted before the pad connects, like a page that loads first.
    tools = createBuiltInToolsController(createFakeManager(), { builtInTools: true });
    tools.mount(document.body);
    connected = true;
    q = (s) => document.querySelector(`.bm-built-in-tools-root ${s}`);
  });

  afterEach(() => {
    tools?.unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const payload = () => JSON.parse(q('.bm-debug-results').value);

  it('names the connected controller when the tool opens', () => {
    tools.openInputRemap();
    expect(payload().runMeta.targetController?.id).toBe(fake.pad.id);
    expect(q('.bm-debug-validation').textContent).not.toMatch(/Missing targetController/);
  });

  it('carries the baseline once Start Debug has captured it', async () => {
    tools.openInputRemap();
    q('.bm-debug-start-btn').click();
    await vi.advanceTimersByTimeAsync(2100);
    expect(q('.bm-debug-status').textContent).toMatch(/^Baseline captured/);
    const p = payload();
    expect(p.runMeta.baseline).not.toBeNull();
    expect(p.runMeta.baseline.buttons).toHaveLength(fake.pad.buttons.length);
    expect(p.runMeta.targetController?.id).toBe(fake.pad.id);
  });
});
