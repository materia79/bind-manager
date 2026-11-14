/**
 * C3: the generator refuses captures that cannot make a working exact
 * profile: a capture of a pad the browser reports in the standard mapping,
 * and (unless replaceLayout / --replace-layout) a capture that would change
 * the raw layout (sourceButtons / sourceAxes) of an existing profile with the
 * same key. Old captures without the mapping field that look standard get a
 * warning. Temp directories only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { processControllerDefs } from '../../scripts/process-controller-defs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHIPPED_CAPTURE = path.join(ROOT, 'src', 'input', 'controller_definitions', 'captures', '054c-0ce6_PS5.json');
const SHIPPED_PROFILE = path.join(ROOT, 'src', 'input', 'controller_definitions', 'profiles', '054c-0ce6.js');
const SHIPPED_INDEX = path.join(ROOT, 'src', 'input', 'controller_definitions', 'index.js');

const temps = [];
afterEach(() => { for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/** A temp workspace: captures/, profiles/ (optionally with the shipped profile), index.js. */
function workspace({ withShippedProfile = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-layout-'));
  temps.push(dir);
  const ws = { dir, capturesDir: path.join(dir, 'captures'), defsDir: path.join(dir, 'profiles'), outFile: path.join(dir, 'index.js') };
  fs.mkdirSync(ws.capturesDir);
  fs.mkdirSync(ws.defsDir);
  if (withShippedProfile) fs.copyFileSync(SHIPPED_PROFILE, path.join(ws.defsDir, '054c-0ce6.js'));
  return ws;
}

const shipped = () => JSON.parse(fs.readFileSync(SHIPPED_CAPTURE, 'utf8'));

/** The shipped capture as a different browser would have recorded it. */
function variant({ mapping, buttons, axes, generatedAt = '2026-11-14T12:00:00.000Z' }) {
  const c = shipped();
  c.generatedAt = generatedAt;
  const t = c.runMeta.targetController;
  if (mapping === undefined) delete t.mapping; else t.mapping = mapping;
  if (buttons != null) t.buttons = buttons;
  if (axes != null) t.axes = axes;
  return c;
}

function write(ws, name, json) {
  fs.writeFileSync(path.join(ws.capturesDir, name), JSON.stringify(json, null, 2));
}

const run = (ws, extra = {}) => processControllerDefs({ ...ws, log: () => {}, ...extra });

describe('process_controller_defs refuses captures that cannot apply (C3)', () => {
  it("a capture with mapping 'standard' is an error naming the file; nothing is written", () => {
    const ws = workspace({ withShippedProfile: true });
    write(ws, '054c-0ce6_dualsense.json', variant({ mapping: 'standard', buttons: 18, axes: 4 }));
    const before = fs.readFileSync(path.join(ws.defsDir, '054c-0ce6.js'), 'utf8');
    const result = run(ws);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^054c-0ce6_dualsense\.json: /);
    expect(result.errors[0]).toMatch(/standard/);
    expect(result.errors[0]).toMatch(/raw layout/);
    expect(fs.readFileSync(path.join(ws.defsDir, '054c-0ce6.js'), 'utf8')).toBe(before);
    expect(fs.existsSync(ws.outFile)).toBe(false);
  });

  it('an old capture without the field that has 17 or 18 buttons and 4 axes gets a warning', () => {
    for (const buttons of [17, 18]) {
      const ws = workspace();
      const c = variant({ buttons, axes: 4 });
      c.runMeta.targetController.id = '1234-abcd-Some Pad';
      write(ws, '1234-abcd_pad.json', c);
      const result = run(ws);
      expect(result.errors).toEqual([]);
      expect(result.warnings.some((w) => /^1234-abcd_pad\.json: .*looks standard-mapped/.test(w)), `${buttons} buttons`).toBe(true);
    }
  });

  it('a raw capture (mapping "") with other counts gets no such warning', () => {
    const ws = workspace();
    const c = variant({ mapping: '', buttons: 14, axes: 12 });
    c.runMeta.targetController.id = '1234-abcd-Some Pad';
    write(ws, '1234-abcd_pad.json', c);
    const result = run(ws);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => /standard-mapped/.test(w))).toBe(false);
  });

  it('a capture that would change the layout of an existing profile is refused unless replaceLayout', () => {
    const ws = workspace({ withShippedProfile: true });
    write(ws, '054c-0ce6_dualsense.json', variant({ mapping: '', buttons: 16, axes: 10 }));
    const refused = run(ws);
    expect(refused.errors).toHaveLength(1);
    expect(refused.errors[0]).toMatch(/^054c-0ce6_dualsense\.json: .*14 buttons \/ 12 axes.*16 buttons \/ 10 axes.*--replace-layout/);

    const replaced = run(ws, { replaceLayout: true });
    expect(replaced.errors).toEqual([]);
    const profile = fs.readFileSync(path.join(ws.defsDir, '054c-0ce6.js'), 'utf8');
    expect(profile).toMatch(/"sourceButtons": 16/);
    expect(profile).toMatch(/"sourceAxes": 10/);
  });

  it('the CLI refuses a standard capture with a non-zero exit and accepts --replace-layout', () => {
    const ws = workspace();
    const sandbox = path.join(ws.dir, 'repo');
    fs.mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(sandbox, 'src', 'input', 'controller_definitions', 'captures'), { recursive: true });
    fs.mkdirSync(path.join(sandbox, 'src', 'input', 'controller_definitions', 'profiles'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'process-controller-defs.js'), path.join(sandbox, 'scripts', 'process-controller-defs.js'));
    for (const f of ['gamepad-profiles.js', 'gamepad-codes.js']) fs.copyFileSync(path.join(ROOT, 'src', 'input', f), path.join(sandbox, 'src', 'input', f));
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{ "type": "module" }');
    const caps = path.join(sandbox, 'src', 'input', 'controller_definitions', 'captures');
    fs.writeFileSync(path.join(caps, '054c-0ce6_dualsense.json'), JSON.stringify(variant({ mapping: 'standard', buttons: 18, axes: 4 })));
    const script = path.join(sandbox, 'scripts', 'process-controller-defs.js');
    const bad = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/054c-0ce6_dualsense\.json: .*standard/);

    fs.writeFileSync(path.join(caps, '054c-0ce6_dualsense.json'), JSON.stringify(variant({ mapping: '', buttons: 14, axes: 12 })));
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(0);
    fs.writeFileSync(path.join(caps, '054c-0ce6_dualsense.json'), JSON.stringify(variant({ mapping: '', buttons: 16, axes: 10 })));
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).not.toBe(0);
    expect(spawnSync(process.execPath, [script, '--replace-layout'], { encoding: 'utf8' }).status).toBe(0);
  });

  it('an unchanged regeneration leaves CRLF copies of the generated files untouched (git status stays clean)', () => {
    const ws = workspace();
    fs.copyFileSync(SHIPPED_CAPTURE, path.join(ws.capturesDir, '054c-0ce6_PS5.json'));
    const crlf = (s) => s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    fs.writeFileSync(path.join(ws.defsDir, '054c-0ce6.js'), crlf(fs.readFileSync(SHIPPED_PROFILE, 'utf8')));
    fs.writeFileSync(ws.outFile, crlf(fs.readFileSync(SHIPPED_INDEX, 'utf8')));
    expect(run(ws).errors).toEqual([]);
    expect(fs.readFileSync(path.join(ws.defsDir, '054c-0ce6.js'), 'utf8')).toContain('\r\n');
    expect(fs.readFileSync(ws.outFile, 'utf8')).toContain('\r\n');
  });

  it('the shipped capture still generates byte-identical output (temp dirs)', () => {
    const ws = workspace({ withShippedProfile: true });
    fs.copyFileSync(SHIPPED_CAPTURE, path.join(ws.capturesDir, '054c-0ce6_PS5.json'));
    const result = run(ws);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => /standard-mapped/.test(w))).toBe(false);
    const norm = (s) => s.replace(/\r\n/g, '\n');
    expect(norm(fs.readFileSync(path.join(ws.defsDir, '054c-0ce6.js'), 'utf8'))).toBe(norm(fs.readFileSync(SHIPPED_PROFILE, 'utf8')));
    expect(norm(fs.readFileSync(ws.outFile, 'utf8'))).toBe(norm(fs.readFileSync(SHIPPED_INDEX, 'utf8')));
  });
});
