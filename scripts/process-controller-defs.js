#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGamepadId } from '../src/input/gamepad-profiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const CAPTURES_DIR = path.join(ROOT, 'src', 'input', 'controller_definitions', 'captures');
const DEFS_DIR = path.join(ROOT, 'src', 'input', 'controller_definitions', 'profiles');
const OUT_FILE = path.join(ROOT, 'src', 'input', 'controller_definitions', 'index.js');

const DPAD_CODES = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];
const HAT_DEFAULT_VALUES = {
  GP_B12: -1.0,      // Up
  GP_B15: -0.428571, // Right
  GP_B13: 0.142857,  // Down
  GP_B14: 0.714286,  // Left
};
const HAT_DEFAULT_TOLERANCE = 0.2;

/**
 * Process every capture JSON in `capturesDir` into profile modules in
 * `defsDir` and the registry `outFile`. Nothing is written when a capture
 * fails; the errors are returned instead.
 * Refused (an error for the file; nothing is written): a capture of a pad the
 * browser reports with mapping 'standard', and, unless `replaceLayout`, a capture
 * that would change sourceButtons / sourceAxes of an existing profile with the
 * same key.
 * @param {{ capturesDir?: string, defsDir?: string, outFile?: string, log?: (line: string) => void, replaceLayout?: boolean }} [options]
 * @returns {{ files: string[], definitions: any[], errors: string[], warnings: string[] }}
 */
export function processControllerDefs(options = {}) {
  const capturesDir = options.capturesDir ?? CAPTURES_DIR;
  const defsDir = options.defsDir ?? DEFS_DIR;
  const outFile = options.outFile ?? OUT_FILE;
  const log = options.log ?? ((line) => console.log(line));

  if (!fs.existsSync(capturesDir)) {
    return { files: [], definitions: [], errors: [`capture directory missing: ${capturesDir}`], warnings: [] };
  }

  const files = fs
    .readdirSync(capturesDir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  const definitions = [];
  const errors = [];
  const warnings = [];

  for (const fileName of files) {
    const fullPath = path.join(capturesDir, fileName);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const json = JSON.parse(raw);
      const sanity = validateCaptureSanity(json);
      for (const err of sanity.errors) errors.push(`${fileName}: ${err}`);
      for (const warning of sanity.warnings) warnings.push(`${fileName}: ${warning}`);
      if (sanity.errors.length > 0) continue;

      const definition = toControllerDefinition(json, fileName, defsDir);
      const layoutError = checkLayoutChange(definition, defsDir, options.replaceLayout === true);
      if (layoutError) {
        errors.push(`${fileName}: ${layoutError}`);
        continue;
      }
      definitions.push(definition);
    } catch (err) {
      errors.push(`${fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    return { files, definitions: [], errors, warnings };
  }

  fs.mkdirSync(defsDir, { recursive: true });
  const dedupedDefinitions = dedupeByDevice(definitions, warnings);
  writeProfileFiles(dedupedDefinitions, defsDir);
  removeStaleProfileFiles(dedupedDefinitions, defsDir);

  const output = renderIndex(dedupedDefinitions, files);
  writeIfChanged(outFile, output);

  log(`[process_controller_defs] Processed ${files.length} capture(s), generated ${dedupedDefinitions.length} device definition(s).`);
  log(`[process_controller_defs] Wrote ${path.relative(ROOT, defsDir)}.`);
  log(`[process_controller_defs] Wrote ${path.relative(ROOT, outFile)}.`);
  return { files, definitions: dedupedDefinitions, errors, warnings };
}

/**
 * An existing generated profile with the same key keeps its raw layout: a
 * capture with other button/axis counts would make it apply to other pads.
 * @returns {string | null} the reason to refuse, or null
 */
function checkLayoutChange(definition, defsDir, replaceLayout) {
  if (replaceLayout) return null;
  const existing = readExistingProfileDefinition(definition.key, defsDir);
  if (!existing || !Number.isInteger(existing.sourceButtons) || !Number.isInteger(existing.sourceAxes)) return null;
  if (existing.sourceButtons === definition.sourceButtons && existing.sourceAxes === definition.sourceAxes) return null;
  return `would change the raw layout of the existing profile ${definition.key} from ${existing.sourceButtons} buttons / ${existing.sourceAxes} axes to ${definition.sourceButtons} buttons / ${definition.sourceAxes} axes; pass --replace-layout (replaceLayout: true) if that is intended`;
}

function main() {
  const result = processControllerDefs({ replaceLayout: process.argv.includes('--replace-layout') });
  if (result.warnings.length > 0) {
    console.warn('[process_controller_defs] Sanity warnings detected:');
    for (const warning of result.warnings) console.warn(`  - ${warning}`);
  }
  if (result.errors.length > 0) {
    console.error('[process_controller_defs] Failed to process one or more captures:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
}

export function validateCaptureSanity(capture) {
  const errors = [];
  const warnings = [];

  if (!capture || typeof capture !== 'object') {
    errors.push('capture root must be an object');
    return { errors, warnings };
  }

  const target = capture?.runMeta?.targetController;
  const hasTarget = !!target && typeof target === 'object';
  if (!hasTarget) {
    warnings.push('runMeta.targetController is missing; processor will attempt VID/PID fallback from capture file name');
  } else {
    if (!target.id || typeof target.id !== 'string') {
      warnings.push('runMeta.targetController.id missing or invalid; processor will attempt VID/PID fallback from capture file name');
    } else {
      const idInfo = parseControllerId(target.id || null);
      if (!idInfo.vendorId || !idInfo.productId) {
        warnings.push('could not extract vendorId/productId from targetController.id; processor will attempt fallback from capture file name');
      }
    }
  }

  const hasControllerDefinition = !!capture?.controllerDefinition && typeof capture.controllerDefinition === 'object';
  const hasControllerDefinitionMappings = hasControllerDefinition
    && ((capture.controllerDefinition.buttons && Object.keys(capture.controllerDefinition.buttons).length > 0)
      || (capture.controllerDefinition.axes && Object.keys(capture.controllerDefinition.axes).length > 0));

  const captures = Array.isArray(capture.captures) ? capture.captures : null;
  if (!captures || captures.length === 0) {
    if (hasControllerDefinitionMappings) {
      warnings.push('captures array is missing/empty; using controllerDefinition mappings as fallback');
      return { errors, warnings };
    }
    errors.push('captures array is missing or empty');
    return { errors, warnings };
  }

  const hasDetectedCapture = captures.some((entry) => entry?.detected && typeof entry.detected === 'object');
  if (!hasDetectedCapture && hasControllerDefinitionMappings) {
    warnings.push('captures contain no detected mappings; using controllerDefinition mappings as fallback');
    return { errors, warnings };
  }

  const sequence = Array.isArray(capture.sequence) ? capture.sequence : null;
  if (sequence && sequence.length > 0) {
    const len = Math.min(sequence.length, captures.length);
    for (let i = 0; i < len; i++) {
      const seqExpected = sequence[i]?.expectedCode;
      const capExpected = captures[i]?.expectedCode;
      if (typeof seqExpected !== 'string' || typeof capExpected !== 'string') continue;
      if (seqExpected !== capExpected) {
        warnings.push(
          `step ${i + 1}: sequence.expectedCode=${seqExpected} differs from captures.expectedCode=${capExpected} (processor uses captures)`
        );
      }
    }
  }

  const expectedSeen = new Set();
  const physicalToExpected = new Map();
  const dpadExpected = DPAD_CODES;
  const dpadPhysicalKeys = new Set();

  const buttonCount = Number.isInteger(target?.buttons) ? target.buttons : null;
  const axisCount = Number.isInteger(target?.axes) ? target.axes : null;

  // The layout the browser reported (captures since the mapping field exist).
  // A standard-mapped pad needs no exact profile: one generated from it would
  // apply to no pad (exact profiles apply only to raw layouts).
  if (target?.mapping === 'standard') {
    errors.push("runMeta.targetController.mapping is 'standard': this browser already reports the controller in the standard layout, so no exact profile is needed (the family labels apply); capture it in a browser that reports the raw layout");
    return { errors, warnings };
  }
  if (typeof target?.mapping !== 'string' && (buttonCount === 17 || buttonCount === 18) && axisCount === 4) {
    warnings.push(`runMeta.targetController has no mapping field and ${buttonCount} buttons / 4 axes: this looks standard-mapped, and a profile from it would apply to no pad`);
  }

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

function validateGeneratedMappingSanity(mapping) {
  const errors = [];
  const warnings = [];

  if (!mapping || typeof mapping !== 'object') {
    errors.push('generated mapping must be an object');
    return { errors, warnings };
  }

  for (const [code, entry] of Object.entries(mapping)) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`${code}: generated entry must be an object`);
      continue;
    }
    if (!['button', 'axis', 'hat'].includes(entry.kind)) {
      errors.push(`${code}: generated entry kind must be button/axis/hat`);
      continue;
    }
    if (!Number.isInteger(entry.index) || entry.index < 0) {
      errors.push(`${code}: generated entry index must be a non-negative integer`);
    }
    if (entry.kind === 'axis' && entry.direction !== 'negative' && entry.direction !== 'positive') {
      errors.push(`${code}: axis entry must include direction negative/positive`);
    }
    if (entry.kind === 'hat') {
      if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
        errors.push(`${code}: hat entry must include numeric value`);
      }
      if (entry.tolerance != null && (typeof entry.tolerance !== 'number' || !Number.isFinite(entry.tolerance) || entry.tolerance <= 0)) {
        errors.push(`${code}: hat entry tolerance must be a positive number`);
      }
      if (entry.tolerance == null) {
        warnings.push(`${code}: hat entry missing tolerance; runtime defaults may vary`);
      }
    }
  }

  return { errors, warnings };
}

export function toControllerDefinition(capture, fileName, defsDir = DEFS_DIR) {
  if (!capture || typeof capture !== 'object') {
    throw new Error('capture root must be an object');
  }

  const runMeta = capture.runMeta ?? {};
  const targetController = runMeta.targetController ?? {};
  const sourceId = typeof targetController.id === 'string' ? targetController.id : null;
  let idInfo = parseControllerId(sourceId);
  if (!idInfo.vendorId || !idInfo.productId) {
    const fileIdInfo = parseControllerIdFromFileName(fileName);
    if (fileIdInfo.vendorId && fileIdInfo.productId) {
      idInfo = {
        vendorId: fileIdInfo.vendorId,
        productId: fileIdInfo.productId,
        name: idInfo.name || 'Unknown Controller',
      };
    }
  }
  if (!idInfo.vendorId || !idInfo.productId) {
    throw new Error('unable to derive vendorId/productId from targetController.id');
  }
  const key = `${idInfo.vendorId}-${idInfo.productId}`;
  const existingProfile = readExistingProfileDefinition(key, defsDir);

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

  // Fallback: include controllerDefinition mappings (useful for tester edit-mode exports
  // that only modify a subset of captures or have null detected entries).
  const fallbackButtons = capture?.controllerDefinition?.buttons;
  if (fallbackButtons && typeof fallbackButtons === 'object') {
    for (const [expected, entry] of Object.entries(fallbackButtons)) {
      if (!Number.isInteger(entry?.buttonIndex)) continue;
      if (!mapping[expected]) {
        mapping[expected] = {
          kind: 'button',
          index: entry.buttonIndex,
        };
      }
    }
  }
  const fallbackAxes = capture?.controllerDefinition?.axes;
  if (fallbackAxes && typeof fallbackAxes === 'object') {
    for (const [expected, entry] of Object.entries(fallbackAxes)) {
      if (!Number.isInteger(entry?.axisIndex)) continue;
      if (!mapping[expected]) {
        mapping[expected] = {
          kind: 'axis',
          index: entry.axisIndex,
          direction: entry.direction === 'negative' ? 'negative' : 'positive',
        };
      }
    }
  }

  // Fallback labels from sequence when captures are sparse.
  if (Array.isArray(capture.sequence)) {
    for (const step of capture.sequence) {
      const expected = step?.expectedCode;
      const label = step?.label;
      if (typeof expected !== 'string') continue;
      if (!labels[expected] && typeof label === 'string' && label.trim()) {
        labels[expected] = label.trim();
      }
    }
  }

  // If D-pad entries collapse to one axis-direction in captures, represent them as
  // hat-value mappings so runtime can resolve all four directions distinctly.
  applyDpadHatHeuristic(mapping);
  const generatedSanity = validateGeneratedMappingSanity(mapping);
  if (generatedSanity.errors.length > 0) {
    throw new Error(generatedSanity.errors.join('; '));
  }

  const mergedMapping = {
    ...(existingProfile?.mapping && typeof existingProfile.mapping === 'object' ? existingProfile.mapping : {}),
    ...mapping,
  };
  const mergedLabels = {
    ...(existingProfile?.labels && typeof existingProfile.labels === 'object' ? existingProfile.labels : {}),
    ...labels,
  };

  const sourceButtons = Number.isInteger(targetController.buttons)
    ? targetController.buttons
    : (Number.isInteger(existingProfile?.sourceButtons) ? existingProfile.sourceButtons : null);
  const sourceAxes = Number.isInteger(targetController.axes)
    ? targetController.axes
    : (Number.isInteger(existingProfile?.sourceAxes) ? existingProfile.sourceAxes : null);
  const profileHint = typeof capture?.controllerDefinition?.profileHint === 'string'
    ? capture.controllerDefinition.profileHint.trim().toLowerCase()
    : (typeof existingProfile?.profileHint === 'string' ? existingProfile.profileHint : null);
  const family = typeof capture?.controllerDefinition?.family === 'string'
    ? capture.controllerDefinition.family.trim().toLowerCase()
    : profileHint;

  return {
    captureFile: fileName,
    key,
    vendorId: idInfo.vendorId,
    productId: idInfo.productId,
    sourceName: idInfo.name,
    sourceId,
    sourceButtons,
    sourceAxes,
    capturedAt: typeof capture.generatedAt === 'string' ? capture.generatedAt : null,
    profileHint,
    family,
    mapping: mergedMapping,
    labels: mergedLabels,
  };
}

function readExistingProfileDefinition(key, defsDir) {
  const filePath = path.join(defsDir, `${key}.js`);
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const marker = 'export const controllerDefinition = ';
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const end = text.indexOf(';', start + marker.length);
  if (end < 0) return null;
  const rawObject = text.slice(start + marker.length, end).trim();
  try {
    return JSON.parse(rawObject);
  } catch {
    return null;
  }
}

function parseControllerIdFromFileName(fileName) {
  const base = String(fileName || '').replace(/\.json$/i, '');
  const m = base.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})(?:[_-].+)?$/);
  if (!m) {
    return { vendorId: null, productId: null };
  }
  return {
    vendorId: m[1].toLowerCase(),
    productId: m[2].toLowerCase(),
  };
}

export function applyDpadHatHeuristic(mapping) {
  const dpadEntries = DPAD_CODES
    .map((code) => [code, mapping[code]])
    .filter(([, entry]) => entry && entry.kind === 'axis');

  if (dpadEntries.length !== DPAD_CODES.length) return;

  const first = dpadEntries[0][1];
  const allSameAxisDirection = dpadEntries.every(([, entry]) =>
    entry.index === first.index && entry.direction === first.direction
  );
  if (!allSameAxisDirection) return;

  for (const [code] of dpadEntries) {
    mapping[code] = {
      kind: 'hat',
      index: first.index,
      value: HAT_DEFAULT_VALUES[code],
      tolerance: HAT_DEFAULT_TOLERANCE,
    };
  }
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

function writeProfileFiles(definitions, defsDir) {
  for (const def of definitions) {
    writeIfChanged(path.join(defsDir, `${def.key}.js`), renderProfileFile(def));
  }
}

/**
 * Write a generated file only when its content changed (line endings aside), so
 * an unchanged regeneration leaves a CRLF checkout untouched and git status clean.
 */
function writeIfChanged(filePath, text) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') === text) return;
  fs.writeFileSync(filePath, text, 'utf8');
}

function removeStaleProfileFiles(definitions, defsDir) {
  const keep = new Set(definitions.map((def) => `${def.key}.js`));
  const existing = fs
    .readdirSync(defsDir)
    .filter((name) => name.toLowerCase().endsWith('.js'));

  for (const fileName of existing) {
    if (!keep.has(fileName)) {
      fs.unlinkSync(path.join(defsDir, fileName));
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
    family: definition.family,
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

export function parseControllerId(controllerId) {
  if (!controllerId) {
    return {
      vendorId: null,
      productId: null,
      name: null,
    };
  }

  // Same parser as the runtime: Firefox "054c-0ce6-Name" and Chrome
  // "Name (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" forms.
  const parsed = parseGamepadId(controllerId);
  return {
    vendorId: parsed.vendorId,
    productId: parsed.productId,
    name: parsed.name || controllerId.trim(),
  };
}

export function renderIndex(definitions, fileNames) {
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
    "import { parseGamepadId } from '../gamepad-profiles.js';",
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
    ' * Return one generated controller profile by exact key.',
    ' */',
    'export function getControllerProfile(key) {',
    '  if (typeof key !== "string") return null;',
    '  return controllerProfiles[key.toLowerCase()] ?? null;',
    '}',
    '',
    '/**',
    ' * Return generated controller profiles belonging to a family.',
    ' */',
    'export function findControllerProfilesByFamily(family) {',
    '  const f = typeof family === "string" ? family.toLowerCase() : null;',
    '  if (!f) return [];',
    '  return Object.values(controllerProfiles).filter((profile) => {',
    '    if (!profile) return false;',
    '    const candidate = typeof profile.family === "string" ? profile.family : profile.profileHint;',
    '    return typeof candidate === "string" && candidate.toLowerCase() === f;',
    '  });',
    '}',
    '',
    '/**',
    ' * Return the profile for exactly this (vendorId, productId), or null.',
    ' * There is no vendor-only fallback: another product of the same vendor',
    ' * has its own raw layout.',
    ' */',
    'export function findControllerProfile(vendorId, productId) {',
    '  const v = typeof vendorId === "string" ? vendorId.toLowerCase() : null;',
    '  const p = typeof productId === "string" ? productId.toLowerCase() : null;',
    '  if (!v || !p) return null;',
    '  return controllerProfiles[`${v}-${p}`] ?? null;',
    '}',
    '',
    '/**',
    ' * Parse VID/PID from a browser gamepad id (Chrome or Firefox form) and return',
    ' * the profile for exactly that device, or null. Whether the profile applies to',
    ' * the connected pad is decided by the resolver (mapping and button/axis counts).',
    ' */',
    'export function findControllerProfileByGamepadId(gamepadId) {',
    '  const { vendorId, productId } = parseGamepadId(gamepadId);',
    '  return findControllerProfile(vendorId, productId);',
    '}',
    '',
  ].join('\n');
}

// Run only when executed as a script, so tests can import the functions.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
