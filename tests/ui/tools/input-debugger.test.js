import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';
import { createFakeManager, createFakePad, installManualRaf, spyText } from './helpers.js';

describe('Input Remap', () => {
  let raf;
  let tools;
  let root;
  let fake;

  beforeEach(() => {
    raf = installManualRaf();
    fake = createFakePad();
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => [fake.pad, null, null, null] });
    tools = createBuiltInToolsController(createFakeManager(), { builtInTools: { inputRemap: true } });
    tools.mount(document.body);
    root = document.querySelector('.bm-built-in-tools-root');
  });

  afterEach(() => {
    tools.unmount();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps the capture JSON format', () => {
    tools.openInputRemap();
    const payload = JSON.parse(root.querySelector('.bm-debug-results').value);
    expect(Object.keys(payload)).toEqual(['schemaVersion', 'generatedAt', 'runMeta', 'sequence', 'captures', 'byExpected', 'controllerDefinition']);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.sequence).toHaveLength(27);
    expect(Object.keys(payload.controllerDefinition)).toEqual(['sourceControllerId', 'profileHint', 'family', 'buttons', 'axes']);
  });

  it('shows the profile header and polls the live box per frame without redundant writes', () => {
    tools.openInputRemap();
    raf.step();
    expect(root.querySelector('.bm-debug-profile-chip').textContent).toBe('Family');
    expect(root.querySelector('.bm-debug-live-state').textContent).toBe('(idle)');
    const select = root.querySelector('.bm-debug-profile-select');
    const selectHtml = vi.spyOn(select, 'innerHTML', 'set');
    const state = spyText(root.querySelector('.bm-debug-live-state'));
    raf.step(10);
    expect(selectHtml).not.toHaveBeenCalled();
    expect(state).not.toHaveBeenCalled();
  });

  it('stops polling on close and on Escape', () => {
    tools.openInputRemap();
    expect(raf.pending()).toBe(1);
    root.querySelector('.bm-debug-close-btn').click();
    expect(raf.pending()).toBe(0);
    tools.openInputRemap();
    root.querySelector('.bm-debug-panel').dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(raf.pending()).toBe(0);
    expect(tools.isAnyOpen()).toBe(false);
  });
});
