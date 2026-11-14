/**
 * L8: the DualSense / PlayStation preset ends with an optional "Touchpad click"
 * step (GP_B17), so a future raw DualSense capture can map the touchpad. A pad
 * without it loses nothing: the tool's validation and the generator accept the
 * step left out; when captured, the generator maps it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getCapturePreset, validateCapturePayload, formatValidationSummary } from '../../../src/ui/tools/capture-payload.js';
import { processControllerDefs, validateCaptureSanity } from '../../../scripts/process-controller-defs.js';

const temps = [];
afterEach(() => { for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/** A complete raw capture of the preset; the touchpad step detected or not. */
function capture({ touchpad }) {
  const steps = getCapturePreset('dualsense').steps;
  const raw = {
    GP_B0: 1, GP_B1: 2, GP_B2: 0, GP_B3: 3, GP_B4: 4, GP_B5: 5, GP_B6: 6, GP_B7: 7, GP_B8: 8, GP_B9: 9, GP_B10: 10, GP_B11: 11, GP_B16: 12, GP_B17: 13,
  };
  const captures = steps.map((step, i) => {
    const code = step.expectedCode;
    let detected = null;
    if (code in raw) detected = { code: `GP_B${raw[code]}`, kind: 'button', index: raw[code], direction: null };
    else if (code === 'GP_B6A') detected = { kind: 'axis', index: 3, direction: 'positive' };
    else if (code === 'GP_B7A') detected = { kind: 'axis', index: 4, direction: 'positive' };
    else if (/^GP_B1[2-5]$/.test(code)) detected = { kind: 'axis', index: 9, direction: 'negative' };
    else if (code.startsWith('GP_A')) detected = { kind: 'axis', index: { 0: 0, 1: 1, 2: 2, 3: 5 }[code[4]], direction: code.endsWith('N') ? 'negative' : 'positive' };
    if (code === 'GP_B17' && !touchpad) detected = null;
    return { step: i + 1, label: step.label, expectedCode: code, instruction: step.instruction, optional: !!step.optional, skipped: false, matched: !!detected, detected };
  });
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-14T12:00:00.000Z',
    runMeta: { targetController: { index: 0, id: '1234-abcd-Raw Pad', mapping: '', buttons: 14, axes: 12 } },
    sequence: steps,
    captures,
    controllerDefinition: { family: 'dualsense', profileHint: 'dualsense', buttons: {}, axes: {} },
  };
}

function generate(json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-touchpad-'));
  temps.push(dir);
  const ws = { capturesDir: path.join(dir, 'captures'), defsDir: path.join(dir, 'profiles'), outFile: path.join(dir, 'index.js') };
  fs.mkdirSync(ws.capturesDir);
  fs.writeFileSync(path.join(ws.capturesDir, '1234-abcd_dualsense.json'), JSON.stringify(json));
  return processControllerDefs({ ...ws, log: () => {} });
}

describe('optional touchpad step (L8)', () => {
  it('the preset ends with an optional Touchpad click step for GP_B17', () => {
    const steps = getCapturePreset('dualsense').steps;
    expect(steps).toHaveLength(28);
    expect(steps.at(-1)).toMatchObject({ label: 'Touchpad click', expectedCode: 'GP_B17', optional: true });
    expect(steps.filter((s) => s.optional).map((s) => s.expectedCode)).toEqual(['GP_B17']);
  });

  it('left out: the tool calls the capture ready and the generator accepts it without a GP_B17 entry', () => {
    const json = capture({ touchpad: false });
    const validation = validateCapturePayload(json);
    expect(validation.errors).toEqual([]);
    expect(formatValidationSummary(validation, json)).not.toMatch(/GP_B17/);
    expect(validateCaptureSanity(json).errors).toEqual([]);
    const result = generate(json);
    expect(result.errors).toEqual([]);
    expect(result.definitions[0].mapping.GP_B17).toBeUndefined();
    expect(result.definitions[0].mapping.GP_B0).toEqual({ kind: 'button', index: 1 });
  });

  it('captured: the generator maps the touchpad', () => {
    const result = generate(capture({ touchpad: true }));
    expect(result.errors).toEqual([]);
    expect(result.definitions[0].mapping.GP_B17).toEqual({ kind: 'button', index: 13 });
  });

  it('a required step without an input is still an error for the generator', () => {
    const json = capture({ touchpad: true });
    json.captures.find((c) => c.expectedCode === 'GP_B5').detected = null;
    expect(validateCaptureSanity(json).errors).toContain('GP_B5: detected mapping is missing');
  });
});
