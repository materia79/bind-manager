/**
 * Guided capture presets and the capture JSON payload helpers (validation, file
 * names, conversions). The payload format is consumed by
 * scripts/process-controller-defs.js; keep it stable.
 */

export const CAPTURE_PRESETS = {
  dualsense: {
    id: 'dualsense',
    label: 'DualSense / PlayStation Layout',
    family: 'dualsense',
    steps: [
      { label: 'Cross', expectedCode: 'GP_B0', instruction: 'Press and hold Cross.' },
      { label: 'Circle', expectedCode: 'GP_B1', instruction: 'Press and hold Circle.' },
      { label: 'Square', expectedCode: 'GP_B2', instruction: 'Press and hold Square.' },
      { label: 'Triangle', expectedCode: 'GP_B3', instruction: 'Press and hold Triangle.' },
      { label: 'L1', expectedCode: 'GP_B4', instruction: 'Press and hold L1.' },
      { label: 'R1', expectedCode: 'GP_B5', instruction: 'Press and hold R1.' },
      { label: 'L2 (digital)', expectedCode: 'GP_B6', instruction: 'Press L2 lightly until it clicks (digital threshold only).' },
      { label: 'L2 (analog)', expectedCode: 'GP_B6A', instruction: 'Press L2 fully past the click to record the full analog axis signal.' },
      { label: 'R2 (digital)', expectedCode: 'GP_B7', instruction: 'Press R2 lightly until it clicks (digital threshold only).' },
      { label: 'R2 (analog)', expectedCode: 'GP_B7A', instruction: 'Press R2 fully past the click to record the full analog axis signal.' },
      { label: 'Create', expectedCode: 'GP_B8', instruction: 'Press and hold Create.' },
      { label: 'Options', expectedCode: 'GP_B9', instruction: 'Press and hold Options.' },
      { label: 'L3', expectedCode: 'GP_B10', instruction: 'Press and hold L3 (left stick click).' },
      { label: 'R3', expectedCode: 'GP_B11', instruction: 'Press and hold R3 (right stick click).' },
      { label: 'D-Pad Up', expectedCode: 'GP_B12', instruction: 'Press and hold D-Pad Up.' },
      { label: 'D-Pad Down', expectedCode: 'GP_B13', instruction: 'Press and hold D-Pad Down.' },
      { label: 'D-Pad Left', expectedCode: 'GP_B14', instruction: 'Press and hold D-Pad Left.' },
      { label: 'D-Pad Right', expectedCode: 'GP_B15', instruction: 'Press and hold D-Pad Right.' },
      { label: 'PS', expectedCode: 'GP_B16', instruction: 'Press and hold the PS button.' },
      { label: 'Left Stick Left', expectedCode: 'GP_A0N', instruction: 'Move and hold the left stick fully left.' },
      { label: 'Left Stick Right', expectedCode: 'GP_A0P', instruction: 'Move and hold the left stick fully right.' },
      { label: 'Left Stick Up', expectedCode: 'GP_A1N', instruction: 'Move and hold the left stick fully up.' },
      { label: 'Left Stick Down', expectedCode: 'GP_A1P', instruction: 'Move and hold the left stick fully down.' },
      { label: 'Right Stick Left', expectedCode: 'GP_A2N', instruction: 'Move and hold the right stick fully left.' },
      { label: 'Right Stick Right', expectedCode: 'GP_A2P', instruction: 'Move and hold the right stick fully right.' },
      { label: 'Right Stick Up', expectedCode: 'GP_A3N', instruction: 'Move and hold the right stick fully up.' },
      { label: 'Right Stick Down', expectedCode: 'GP_A3P', instruction: 'Move and hold the right stick fully down.' },
    ],
  },
};

export const DEFAULT_CAPTURE_PRESET = 'dualsense';
export const DPAD_CODES = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];


export function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

export function toDetectedFromMappingEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.kind === 'button' && Number.isInteger(entry.index) && entry.index >= 0) return { code: `GP_B${entry.index}`, kind: 'button', index: entry.index, direction: null, score: 1, frames: 1, peakDelta: 1, peakRaw: 1 };
  if (entry.kind === 'axis' && Number.isInteger(entry.index) && entry.index >= 0) {
    const direction = entry.direction === 'negative' ? 'negative' : 'positive';
    return { code: `GP_A${entry.index}${direction === 'negative' ? 'N' : 'P'}`, kind: 'axis', index: entry.index, direction, score: 1, frames: 1, peakDelta: 1, peakRaw: 1 };
  }
  return null;
}

export function getPayloadOverrideMapping(payload) {
  const mapping = {};
  const buttonEntries = payload?.controllerDefinition?.buttons || {};
  for (const [code, entry] of Object.entries(buttonEntries)) {
    if (!entry || typeof entry.buttonIndex !== 'number') continue;
    mapping[code] = { kind: 'button', index: entry.buttonIndex };
  }
  const axisEntries = payload?.controllerDefinition?.axes || {};
  for (const [code, entry] of Object.entries(axisEntries)) {
    if (!entry || typeof entry.axisIndex !== 'number') continue;
    const direction = entry.direction === 'negative' ? 'negative' : 'positive';
    mapping[code] = { kind: 'axis', index: entry.axisIndex, direction };
  }
  return mapping;
}

export function normalizePayloadForProcessing(payload, resolvedMapping = {}) {
  if (!payload || typeof payload !== 'object') return;
  const preset = getCapturePreset(DEFAULT_CAPTURE_PRESET);
  payload.sequence = Array.isArray(payload.sequence) && payload.sequence.length > 0 ? payload.sequence : cloneJson(preset.steps);
  payload.controllerDefinition = payload.controllerDefinition && typeof payload.controllerDefinition === 'object' ? payload.controllerDefinition : { buttons: {}, axes: {} };
  payload.controllerDefinition.buttons = payload.controllerDefinition.buttons && typeof payload.controllerDefinition.buttons === 'object' ? payload.controllerDefinition.buttons : {};
  payload.controllerDefinition.axes = payload.controllerDefinition.axes && typeof payload.controllerDefinition.axes === 'object' ? payload.controllerDefinition.axes : {};
  const existingByExpected = payload.byExpected && typeof payload.byExpected === 'object' ? { ...payload.byExpected } : {};
  for (const item of Array.isArray(payload.captures) ? payload.captures : []) {
    if (!item || typeof item.expectedCode !== 'string') continue;
    existingByExpected[item.expectedCode] = item;
  }
  const removedCodes = new Set(Array.isArray(payload?.testerOverrides?.removedCodes) ? payload.testerOverrides.removedCodes : []);
  const payloadOverrideMapping = getPayloadOverrideMapping(payload);
  const captures = [];
  const byExpected = {};
  for (let i = 0; i < payload.sequence.length; i++) {
    const step = payload.sequence[i] || {};
    const expectedCode = step.expectedCode;
    if (typeof expectedCode !== 'string') continue;
    const existing = existingByExpected[expectedCode] && typeof existingByExpected[expectedCode] === 'object' ? existingByExpected[expectedCode] : null;
    let detected = existing?.detected ?? null;
    if (!detected && !removedCodes.has(expectedCode)) {
      const mappingEntry = payloadOverrideMapping[expectedCode] || resolvedMapping[expectedCode] || null;
      detected = toDetectedFromMappingEntry(mappingEntry);
    }
    const capture = { step: i + 1, label: step.label || existing?.label || expectedCode, expectedCode, instruction: step.instruction || existing?.instruction || `Captured from tester update for ${expectedCode}.`, skipped: false, matched: !!detected, detected };
    captures.push(capture);
    byExpected[expectedCode] = cloneJson(capture);
  }
  payload.captures = captures;
  payload.byExpected = byExpected;
  if (!payload.runMeta || typeof payload.runMeta !== 'object') payload.runMeta = {};
  payload.runMeta.totalSteps = payload.sequence.length;
  payload.runMeta.completedSteps = captures.filter((entry) => !!entry.detected).length;
}

export function validateCapturePayload(payload) {
  const errors = [];
  const warnings = [];
  const target = payload?.runMeta?.targetController;
  if (!target?.id) {
    errors.push('Missing targetController.id.');
    return { errors, warnings };
  }
  const idInfo = parseControllerId(target.id);
  if (!idInfo.vendorId || !idInfo.productId) errors.push('Controller id does not expose a vendor/product pair.');
  const captures = Array.isArray(payload?.captures) ? payload.captures : [];
  if (captures.length === 0) {
    errors.push('No capture steps recorded yet.');
    return { errors, warnings };
  }
  const expectedSeen = new Set();
  const dpadPhysicalKeys = new Set();
  for (const entry of captures) {
    if (typeof entry?.expectedCode !== 'string') {
      errors.push('A capture entry is missing expectedCode.');
      continue;
    }
    if (expectedSeen.has(entry.expectedCode)) warnings.push(`Duplicate expectedCode ${entry.expectedCode}; last one wins.`);
    expectedSeen.add(entry.expectedCode);
    if (!entry.detected) continue;
    const { kind, index, direction } = entry.detected;
    if (kind !== 'button' && kind !== 'axis') { errors.push(`${entry.expectedCode} resolved to an unsupported kind.`); continue; }
    if (!Number.isInteger(index) || index < 0) { errors.push(`${entry.expectedCode} resolved to an invalid index.`); continue; }
    if (kind === 'axis' && direction !== 'negative' && direction !== 'positive') { errors.push(`${entry.expectedCode} axis detection is missing direction.`); continue; }
    const physicalKey = kind === 'button' ? `button:${index}` : `axis:${index}:${direction}`;
    if (DPAD_CODES.includes(entry.expectedCode)) dpadPhysicalKeys.add(physicalKey);
    if (/^GP_A\d+[NP]$/.test(entry.expectedCode) && kind !== 'axis') warnings.push(`${entry.expectedCode} looks like an axis code but was detected as ${kind}.`);
  }
  for (const code of DPAD_CODES) if (!expectedSeen.has(code)) errors.push(`Missing required D-Pad capture ${code}.`);
  if (dpadPhysicalKeys.size > 0 && dpadPhysicalKeys.size < 3) warnings.push('D-Pad mappings are not distinct enough yet for reliable processing.');
  return { errors, warnings };
}

export function formatValidationSummary(validation, payload) {
  const fileName = suggestCaptureFileName(JSON.stringify(payload));
  if (validation.errors.length > 0) return `Validation: ${validation.errors.join(' ')} Suggested filename: ${fileName}`;
  if (validation.warnings.length > 0) return `Validation warnings: ${validation.warnings.join(' ')} Suggested filename: ${fileName}`;
  return `Validation: ready to export. Suggested filename: ${fileName}. After download, place it in src/input/controller_definitions/captures/ and run npm run process_controller_defs.`;
}

export function suggestCaptureFileName(payloadText) {
  try {
    const payload = JSON.parse(payloadText);
    const idInfo = parseControllerId(payload?.runMeta?.targetController?.id || '');
    const family = payload?.controllerDefinition?.family || payload?.controllerDefinition?.profileHint || 'controller';
    if (idInfo.vendorId && idInfo.productId) return `${idInfo.vendorId}-${idInfo.productId}_${family}.json`;
  } catch {
    // ignore
  }
  return 'controller_capture.json';
}

export function parseControllerId(controllerId) {
  if (!controllerId || typeof controllerId !== 'string') return { vendorId: null, productId: null };
  const trimmed = controllerId.trim();
  const directMatch = trimmed.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-/);
  if (directMatch) return { vendorId: directMatch[1].toLowerCase(), productId: directMatch[2].toLowerCase() };
  const vendorMatch = trimmed.match(/vendor\D*([0-9a-fA-F]{4})/i);
  const productMatch = trimmed.match(/product\D*([0-9a-fA-F]{4})/i);
  return { vendorId: vendorMatch ? vendorMatch[1].toLowerCase() : null, productId: productMatch ? productMatch[1].toLowerCase() : null };
}

export function getCapturePreset(presetId) { return CAPTURE_PRESETS[presetId] ?? CAPTURE_PRESETS[DEFAULT_CAPTURE_PRESET]; }
