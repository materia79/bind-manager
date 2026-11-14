/**
 * C1 / C2: the capture records the layout the browser reports, and Input
 * Remap never calls a capture of a standard-mapped pad ready: no exact
 * profile is needed there (the family labels apply). The fact also shows up
 * front when the tool opens, and next to the Controller Test's Download JSON.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBuiltInToolsController } from '../../../src/ui/built-in-tools-controller.js';
import {
  validateCapturePayload,
  formatValidationSummary,
  STANDARD_LAYOUT_NOTE,
  getCapturePreset,
} from '../../../src/ui/tools/capture-payload.js';
import { createFakeManager, createFakePad, installManualRaf } from './helpers.js';

/** A complete guided capture of the DualSense preset. */
function fullPayload(mapping) {
  const steps = getCapturePreset('dualsense').steps.filter((s) => !s.optional);
  const captures = steps.map((step, i) => ({
    step: i + 1,
    label: step.label,
    expectedCode: step.expectedCode,
    detected: step.expectedCode.startsWith('GP_A')
      ? { kind: 'axis', index: Number(step.expectedCode[4]), direction: step.expectedCode.endsWith('N') ? 'negative' : 'positive' }
      : { kind: 'button', index: i },
  }));
  const target = { index: 0, id: '054c-0ce6-DualSense Wireless Controller', buttons: 14, axes: 12 };
  if (mapping !== undefined) target.mapping = mapping;
  return { runMeta: { targetController: target }, captures, controllerDefinition: { family: 'dualsense' } };
}

describe('capture validation and the browser layout (C2)', () => {
  it("a standard-mapped capture is an error that says why, and no 'place it in captures/' instruction", () => {
    const payload = fullPayload('standard');
    const validation = validateCapturePayload(payload);
    expect(validation.errors).toContain(STANDARD_LAYOUT_NOTE);
    expect(STANDARD_LAYOUT_NOTE).toMatch(/already reports this controller in the standard layout/);
    expect(STANDARD_LAYOUT_NOTE).toMatch(/no exact profile is needed/);
    expect(STANDARD_LAYOUT_NOTE).toMatch(/raw layout/);
    const summary = formatValidationSummary(validation, payload);
    expect(summary).not.toMatch(/ready to export/);
    expect(summary).not.toMatch(/process_controller_defs|captures\//);
  });

  it('a raw capture (mapping "") and an old capture without the field are still ready to export', () => {
    for (const mapping of ['', undefined]) {
      const payload = fullPayload(mapping);
      const validation = validateCapturePayload(payload);
      expect(validation.errors, String(mapping)).toEqual([]);
      expect(formatValidationSummary(validation, payload)).toMatch(/ready to export/);
    }
  });
});

describe('Input Remap and Controller Test on a standard or raw pad (C1, C2)', () => {
  let tools;
  let fake;
  let q;

  function mount(mapping) {
    installManualRaf();
    fake = createFakePad();
    fake.pad.mapping = mapping;
    vi.stubGlobal('navigator', { ...globalThis.navigator, getGamepads: () => [fake.pad, null, null, null] });
    tools = createBuiltInToolsController(createFakeManager(), { builtInTools: true });
    tools.mount(document.body);
    q = (s) => document.querySelector(`.bm-built-in-tools-root ${s}`);
  }

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => {
    tools?.unmount();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const payload = () => JSON.parse(q('.bm-debug-results').value);
  const shown = (sel) => { const el = q(sel); return !!el && !el.hidden && el.textContent.trim().length > 0; };

  it("standard pad: the JSON records mapping 'standard', the note shows on open, the validation is the error", () => {
    mount('standard');
    tools.openInputRemap();
    expect(payload().runMeta.targetController.mapping).toBe('standard');
    expect(shown('.bm-debug-layout-note')).toBe(true);
    expect(q('.bm-debug-layout-note').textContent).toBe(STANDARD_LAYOUT_NOTE);
    expect(q('.bm-debug-validation').textContent).toContain(STANDARD_LAYOUT_NOTE);
    expect(q('.bm-debug-validation').textContent).not.toMatch(/ready to export/);
    // Copy and Download stay possible.
    expect(q('.bm-debug-copy-btn').disabled).toBe(false);
    expect(q('.bm-debug-download-btn').disabled).toBe(false);
  });

  it("raw pad: mapping '' recorded, no note", () => {
    mount('');
    tools.openInputRemap();
    expect(payload().runMeta.targetController.mapping).toBe('');
    expect(shown('.bm-debug-layout-note')).toBe(false);
  });

  it('Controller Test: the same note next to Download JSON for a standard pad only', () => {
    mount('standard');
    tools.openControllerTest();
    q('.bm-tester-editor-btn').click();
    expect(shown('.bm-tester-layout-note')).toBe(true);
    expect(q('.bm-tester-layout-note').textContent).toBe(STANDARD_LAYOUT_NOTE);
    tools.unmount();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();

    mount('');
    tools.openControllerTest();
    q('.bm-tester-editor-btn').click();
    expect(shown('.bm-tester-layout-note')).toBe(false);
  });
});
