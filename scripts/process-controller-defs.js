#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const CAPTURES_DIR = path.join(ROOT, 'src', 'input', 'controller_definitions', 'captures');
const DEFS_DIR = path.join(ROOT, 'src', 'input', 'controller_definitions', 'profiles');
const OUT_FILE = path.join(ROOT, 'src', 'input', 'controller_definitions', 'index.js');

function main() {
  if (!fs.existsSync(CAPTURES_DIR)) {
    console.error(`[process_controller_defs] capture directory missing: ${CAPTURES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(DEFS_DIR, { recursive: true });

  const files = fs
    .readdirSync(CAPTURES_DIR)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  const definitions = [];
  const errors = [];
  const warnings = [];

  for (const fileName of files) {
    const fullPath = path.join(CAPTURES_DIR, fileName);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const json = JSON.parse(raw);
      const sanity = validateCaptureSanity(json);
      for (const err of sanity.errors) errors.push(`${fileName}: ${err}`);
      for (const warning of sanity.warnings) warnings.push(`${fileName}: ${warning}`);
      if (sanity.errors.length > 0) continue;

      const definition = toControllerDefinition(json, fileName);
      definitions.push(definition);
    } catch (err) {
      errors.push(`${fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error('[process_controller_defs] Failed to process one or more captures:');
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const dedupedDefinitions = dedupeByDevice(definitions, warnings);
  writeProfileFiles(dedupedDefinitions);
  removeStaleProfileFiles(dedupedDefinitions);

  const output = renderIndex(dedupedDefinitions, files);
  fs.writeFileSync(OUT_FILE, output, 'utf8');

  if (warnings.length > 0) {
    console.warn('[process_controller_defs] Sanity warnings detected:');
    for (const warning of warnings) console.warn(`  - ${warning}`);
  }

  console.log(`[process_controller_defs] Processed ${files.length} capture(s), generated ${dedupedDefinitions.length} device definition(s).`);
  console.log(`[process_controller_defs] Wrote ${path.relative(ROOT, DEFS_DIR)}.`);
  console.log(`[process_controller_defs] Wrote ${path.relative(ROOT, OUT_FILE)}.`);
}

function validateCaptureSanity(capture) {
  const errors = [];
  const warnings = [];

  if (!capture || typeof capture !== 'object') {
    errors.push('capture root must be an object');
    return { errors, warnings };
  }

  const target = capture?.runMeta?.targetController;
  if (!target || typeof target !== 'object') {
    errors.push('runMeta.targetController is missing');
    return { errors, warnings };
  }

  if (!target.id || typeof target.id !== 'string') {
    errors.push('runMeta.targetController.id must be a non-empty string');
  }

  const idInfo = parseControllerId(target.id || null);
  if (!idInfo.vendorId || !idInfo.productId) {
    errors.push('could not extract vendorId/productId from targetController.id');
  }

  const captures = Array.isArray(capture.captures) ? capture.captures : null;
  if (!captures || captures.length === 0) {
    errors.push('captures array is missing or empty');
    return { errors, warnings };
  }

  const expectedSeen = new Set();
  const physicalToExpected = new Map();
  const dpadExpected = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];
  const dpadPhysicalKeys = new Set();

  const buttonCount = Number.isInteger(target.buttons) ? target.buttons : null;
  const axisCount = Number.isInteger(target.axes) ? target.axes : null;

  for (const entry of captures) {
    const expected = entry?.expectedCode;
    const detected = entry?.detected;

    if (typeof expected !== 'string') {
      errors.push('capture entry missing expectedCode string');
      continue;
    }

    if (expectedSeen.has(expected)) {
      warnings.push(`duplicate expectedCode entry found: ${expected} (last one wins)`);
    }
    expectedSeen.add(expected);

    if (!detected || typeof detected !== 'object') {
      errors.push(`${expected}: detected mapping is missing`);
      continue;
    }

    const kind = detected.kind;
    const index = detected.index;
    if (kind !== 'button' && kind !== 'axis') {
      errors.push(`${expected}: detected.kind must be "button" or "axis"`);
      continue;
    }
    if (!Number.isInteger(index) || index < 0) {
      errors.push(`${expected}: detected.index must be a non-negative integer`);
      continue;
    }

    if (kind === 'button' && buttonCount != null && index >= buttonCount) {
      warnings.push(`${expected}: detected button index ${index} is out of range for button count ${buttonCount}`);
    }
    if (kind === 'axis' && axisCount != null && index >= axisCount) {
      warnings.push(`${expected}: detected axis index ${index} is out of range for axis count ${axisCount}`);
    }

    if (kind === 'axis' && detected.direction !== 'negative' && detected.direction !== 'positive') {
      errors.push(`${expected}: detected axis mapping must include direction "negative" or "positive"`);
      continue;
    }

    const physicalKey = kind === 'button'
      ? `button:${index}`
      : `axis:${index}:${detected.direction}`;

    const previousExpected = physicalToExpected.get(physicalKey);
    if (previousExpected && previousExpected !== expected) {
      warnings.push(`${expected}: shares same physical input (${physicalKey}) with ${previousExpected}`);
    } else {
      physicalToExpected.set(physicalKey, expected);
    }

    if (/^GP_A\d+[NP]$/.test(expected) && kind !== 'axis') {
      warnings.push(`${expected}: axis expectedCode resolved to non-axis input (${kind}:${index})`);
    }

    if (dpadExpected.includes(expected)) {
      dpadPhysicalKeys.add(physicalKey);
    }
  }

  for (const expected of dpadExpected) {
    if (!expectedSeen.has(expected)) {
      errors.push(`missing expected D-Pad mapping entry: ${expected}`);
    }
  }

  if (dpadPhysicalKeys.size < 3) {
    warnings.push('D-Pad mappings are not distinct enough (expected at least 3 unique physical inputs)');
  }

  return { errors, warnings };
}

function toControllerDefinition(capture, fileName) {
  if (!capture || typeof capture !== 'object') {
    throw new Error('capture root must be an object');
  }

  const runMeta = capture.runMeta ?? {};
  const targetController = runMeta.targetController ?? {};
  const sourceId = typeof targetController.id === 'string' ? targetController.id : null;
  const idInfo = parseControllerId(sourceId);
  if (!idInfo.vendorId || !idInfo.productId) {
    throw new Error('unable to derive vendorId/productId from targetController.id');
  }

  const captures = Array.isArray(capture.captures) ? capture.captures : [];
  const mapping = {};
  const labels = {};

  for (const entry of captures) {
    const expected = entry?.expectedCode;
    const detected = entry?.detected;
    if (typeof expected !== 'string') continue;
    if (typeof entry?.label === 'string' && entry.label.trim()) {
      labels[expected] = entry.label.trim();
    }
    if (!detected || typeof detected !== 'object') continue;

    const kind = detected.kind;
    const index = detected.index;
    if ((kind !== 'button' && kind !== 'axis') || !Number.isInteger(index)) continue;

    if (kind === 'button') {
      mapping[expected] = {
        kind: 'button',
        index,
      };
      continue;
    }

    mapping[expected] = {
      kind: 'axis',
      index,
      direction: detected.direction === 'negative' ? 'negative' : 'positive',
    };
  }

  const sourceButtons = Number.isInteger(targetController.buttons) ? targetController.buttons : null;
  const sourceAxes = Number.isInteger(targetController.axes) ? targetController.axes : null;

  return {
    captureFile: fileName,
    key: `${idInfo.vendorId}-${idInfo.productId}`,
    vendorId: idInfo.vendorId,
    productId: idInfo.productId,
    sourceName: idInfo.name,
    sourceId,
    sourceButtons,
    sourceAxes,
    capturedAt: typeof capture.generatedAt === 'string' ? capture.generatedAt : null,
    profileHint: typeof capture?.controllerDefinition?.profileHint === 'string'
      ? capture.controllerDefinition.profileHint
      : null,
    mapping,
    labels,
  };
}

function dedupeByDevice(definitions, warnings) {
  const byKey = new Map();
  for (const def of definitions) {
    const existing = byKey.get(def.key);
    if (!existing) {
      byKey.set(def.key, def);
      continue;
    }

    const existingDate = existing.capturedAt ? Date.parse(existing.capturedAt) : 0;
    const incomingDate = def.capturedAt ? Date.parse(def.capturedAt) : 0;
    if (incomingDate >= existingDate) {
      warnings.push(`multiple captures for ${def.key}; using newer ${def.captureFile}`);
      byKey.set(def.key, def);
    } else {
      warnings.push(`multiple captures for ${def.key}; keeping newer ${existing.captureFile}`);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function writeProfileFiles(definitions) {
  for (const def of definitions) {
    const filePath = path.join(DEFS_DIR, `${def.key}.js`);
    fs.writeFileSync(filePath, renderProfileFile(def), 'utf8');
  }
}

function removeStaleProfileFiles(definitions) {
  const keep = new Set(definitions.map((def) => `${def.key}.js`));
  const existing = fs
    .readdirSync(DEFS_DIR)
    .filter((name) => name.toLowerCase().endsWith('.js'));

  for (const fileName of existing) {
    if (!keep.has(fileName)) {
      fs.unlinkSync(path.join(DEFS_DIR, fileName));
    }
  }
}

function renderProfileFile(definition) {
  const payload = {
    key: definition.key,
    vendorId: definition.vendorId,
    productId: definition.productId,
    sourceName: definition.sourceName,
    sourceId: definition.sourceId,
    sourceButtons: definition.sourceButtons,
    sourceAxes: definition.sourceAxes,
    capturedAt: definition.capturedAt,
    profileHint: definition.profileHint,
    labels: definition.labels,
    mapping: definition.mapping,
  };

  return [
    '/**',
    ' * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.',
    ' * Generated by: npm run process_controller_defs',
    ` * Source capture: ${definition.captureFile}`,
    ' */',
    '',
    `export const controllerDefinition = ${JSON.stringify(payload, null, 2)};`,
    '',
    'export default controllerDefinition;',
    '',
  ].join('\n');
}

function parseControllerId(controllerId) {
  if (!controllerId) {
    return {
      vendorId: null,
      productId: null,
      name: null,
    };
  }

  const trimmed = controllerId.trim();
  const prefixMatch = trimmed.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-(.+)$/);
  if (prefixMatch) {
    return {
      vendorId: prefixMatch[1].toLowerCase(),
      productId: prefixMatch[2].toLowerCase(),
      name: prefixMatch[3].trim(),
    };
  }

  // Browser strings can vary. Try to recover VID/PID from "Vendor: 054c Product: 0ce6" forms.
  const vendorMatch = trimmed.match(/vendor\D*([0-9a-fA-F]{4})/i);
  const productMatch = trimmed.match(/product\D*([0-9a-fA-F]{4})/i);

  return {
    vendorId: vendorMatch ? vendorMatch[1].toLowerCase() : null,
    productId: productMatch ? productMatch[1].toLowerCase() : null,
    name: trimmed,
  };
}

function renderIndex(definitions, fileNames) {
  const importLines = definitions.map((def, idx) =>
    `import profile${idx} from './profiles/${def.key}.js';`
  );

  const objectLines = definitions.map((def, idx) =>
    `  '${def.key}': profile${idx},`
  );

  return [
    '/**',
    ' * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.',
    ' *',
    ' * Generated by: npm run process_controller_defs',
    ` * Source captures: ${fileNames.length ? fileNames.join(', ') : '(none)'}`,
    ' */',
    '',
    ...importLines,
    '',
    'export const controllerProfiles = {',
    ...objectLines,
    '};',
    '',
    '/**',
    ' * Return all generated controller profiles.',
    ' */',
    'export function getControllerProfiles() {',
    '  return controllerProfiles;',
    '}',
    '',
    '/**',
    ' * Resolve the most specific profile by (vendorId, productId).',
    ' * Falls back to first profile with matching vendorId if exact product is unknown.',
    ' */',
    'export function findControllerProfile(vendorId, productId) {',
    '  const v = typeof vendorId === "string" ? vendorId.toLowerCase() : null;',
    '  const p = typeof productId === "string" ? productId.toLowerCase() : null;',
    '  if (!v) return null;',
    '',
    '  const exactKey = p ? `${v}-${p}` : null;',
    '  if (exactKey && controllerProfiles[exactKey]) return controllerProfiles[exactKey];',
    '',
    '  let vendorFallback = null;',
    '  for (const profile of Object.values(controllerProfiles)) {',
    '    if (!profile || profile.vendorId !== v) continue;',
    '    if (!vendorFallback) vendorFallback = profile;',
    '    if (p && profile.productId === p) return profile;',
    '  }',
    '  return vendorFallback;',
    '}',
    '',
    '/**',
    ' * Parse VID/PID from a browser gamepad id string and return a matching profile if present.',
    ' */',
    'export function findControllerProfileByGamepadId(gamepadId) {',
    '  if (!gamepadId || typeof gamepadId !== "string") return null;',
    '  const m = gamepadId.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-/);',
    '  if (!m) return null;',
    '  return findControllerProfile(m[1], m[2]);',
    '}',
    '',
  ].join('\n');
}

main();
