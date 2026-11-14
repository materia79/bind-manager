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

/**
 * Why a capture of a pad the browser reports with mapping 'standard' is not an
 * exact profile: shown as the validation error and as a note in the tools.
 */
export const STANDARD_LAYOUT_NOTE = 'This browser already reports this controller in the standard layout, so no exact profile is needed: the family labels apply. An exact profile is only for a browser that reports a raw layout.';

/** True when a capture or a Gamepad reports the browser's standard mapping. */
export function isStandardMapping(mapping) {
  return mapping === 'standard';
}
export const DPAD_CODES = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];


export function cloneJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

export function validateCapturePayload(payload) {
  const errors = [];
  const warnings = [];
  const target = payload?.runMeta?.targetController;
  if (!target?.id) {
    errors.push('Missing targetController.id.');
    return { errors, warnings };
  }
  // The browser already maps this pad to the standard layout: an exact profile
  // from it would apply to no pad (they apply only to raw layouts). Old captures
  // without the field are not judged here.
  if (isStandardMapping(target.mapping)) errors.push(STANDARD_LAYOUT_NOTE);
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
