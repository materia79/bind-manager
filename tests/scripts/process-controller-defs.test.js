/**
 * Tests for scripts/process-controller-defs.js (capture JSON -> exact
 * controller profiles + generated registry).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'process-controller-defs.js');
const FIXTURE = path.join(HERE, 'fixtures', 'raw-pad-capture.json');

function readFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

/**
 * Lay out a throwaway copy of the repo paths the script uses, so the CLI can
 * run end to end without touching the real controller_definitions folder.
 */
function makeSandbox(captures) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-defs-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'src', 'input', 'controller_definitions', 'captures'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'process-controller-defs.js'));
  for (const file of ['gamepad-profiles.js', 'gamepad-codes.js']) {
    fs.copyFileSync(path.join(ROOT, 'src', 'input', file), path.join(dir, 'src', 'input', file));
  }
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }');
  for (const [name, json] of Object.entries(captures)) {
    fs.writeFileSync(path.join(dir, 'src', 'input', 'controller_definitions', 'captures', name), JSON.stringify(json));
  }
  return dir;
}

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('process-controller-defs CLI', () => {
  it('a capture without runMeta.targetController warns and falls back to the file name (A13)', () => {
    const capture = readFixture();
    delete capture.runMeta.targetController;
    const sandbox = makeSandbox({ '1234-abcd_fixture.json': capture });
    tempDirs.push(sandbox);

    const run = spawnSync(process.execPath, [path.join(sandbox, 'scripts', 'process-controller-defs.js')], { encoding: 'utf8' });

    expect(run.stderr).not.toMatch(/TypeError/);
    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(/targetController is missing/);
    const profile = path.join(sandbox, 'src', 'input', 'controller_definitions', 'profiles', '1234-abcd.js');
    expect(fs.existsSync(profile)).toBe(true);
  });
});

describe('process-controller-defs module', () => {
  let mod;
  let out;
  beforeEach(async () => {
    mod = await import('../../scripts/process-controller-defs.js');
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-defs-out-'));
    tempDirs.push(out);
  });

  function run(captures) {
    const capturesDir = path.join(out, 'captures');
    fs.mkdirSync(capturesDir, { recursive: true });
    for (const [name, json] of Object.entries(captures)) {
      fs.writeFileSync(path.join(capturesDir, name), JSON.stringify(json));
    }
    return mod.processControllerDefs({
      capturesDir,
      defsDir: path.join(out, 'profiles'),
      outFile: path.join(out, 'index.js'),
      log: () => {},
    });
  }

  it('importing the script does not run it', () => {
    expect(typeof mod.processControllerDefs).toBe('function');
  });

  it('turns a fixture capture into a profile definition', () => {
    const result = run({ 'fixture.json': readFixture() });
    expect(result.errors).toEqual([]);
    expect(result.definitions).toHaveLength(1);
    const def = result.definitions[0];
    expect(def).toMatchObject({
      key: '1234-abcd',
      vendorId: '1234',
      productId: 'abcd',
      sourceName: 'Fixture Raw Pad',
      sourceButtons: 14,
      sourceAxes: 10,
      family: 'generic',
    });
    expect(def.mapping.GP_B0).toEqual({ kind: 'button', index: 1 });
    expect(def.mapping.GP_A0N).toEqual({ kind: 'axis', index: 0, direction: 'negative' });
    expect(def.labels.GP_B0).toBe('South');
    expect(fs.existsSync(path.join(out, 'profiles', '1234-abcd.js'))).toBe(true);
  });

  it('a capture without targetController falls back to the file name with a warning', () => {
    const capture = readFixture();
    delete capture.runMeta.targetController;
    const result = run({ '1234-abcd_fixture.json': capture });
    expect(result.errors).toEqual([]);
    expect(result.definitions[0].key).toBe('1234-abcd');
    expect(result.definitions[0].sourceButtons).toBeNull();
    expect(result.warnings.some((w) => /targetController is missing/.test(w))).toBe(true);
  });

  it('a capture without targetController and without ids in the file name is an error, not a crash', () => {
    const capture = readFixture();
    delete capture.runMeta.targetController;
    const result = run({ 'fixture.json': capture });
    expect(result.definitions).toEqual([]);
    expect(result.errors.join('\n')).toMatch(/vendorId\/productId/);
  });

  it('converts D-pad entries collapsed on one axis into hat values', () => {
    const def = run({ 'fixture.json': readFixture() }).definitions[0];
    expect(def.mapping.GP_B12).toEqual({ kind: 'hat', index: 9, value: -1, tolerance: 0.2 });
    expect(def.mapping.GP_B15).toEqual({ kind: 'hat', index: 9, value: -0.428571, tolerance: 0.2 });
    expect(def.mapping.GP_B13).toEqual({ kind: 'hat', index: 9, value: 0.142857, tolerance: 0.2 });
    expect(def.mapping.GP_B14).toEqual({ kind: 'hat', index: 9, value: 0.714286, tolerance: 0.2 });
  });

  it('reads Chrome-form ids with the shared parser', () => {
    const capture = readFixture();
    capture.runMeta.targetController.id = 'Fixture Raw Pad (Vendor: 1234 Product: abcd)';
    const def = run({ 'fixture.json': capture }).definitions[0];
    expect(def.key).toBe('1234-abcd');
    expect(def.sourceName).toBe('Fixture Raw Pad');
  });

  it('the generated registry has no vendor-only fallback', () => {
    run({ 'fixture.json': readFixture() });
    const index = fs.readFileSync(path.join(out, 'index.js'), 'utf8');
    expect(index).not.toMatch(/vendorFallback/);
    expect(index).toMatch(/import \{ parseGamepadId \} from '\.\.\/gamepad-profiles\.js';/);
    expect(index).toMatch(/'1234-abcd': profile0,/);
  });

  it('the checked-in registry matches exact vendor/product only', async () => {
    const registry = await import('../../src/input/controller_definitions/index.js');
    expect(registry.findControllerProfile('054c', '0ce6')?.key).toBe('054c-0ce6');
    expect(registry.findControllerProfile('054c', '09cc')).toBeNull();
    expect(registry.findControllerProfile('054c', null)).toBeNull();
    expect(registry.findControllerProfileByGamepadId('054c-05c4-Wireless Controller')).toBeNull();
  });
});
