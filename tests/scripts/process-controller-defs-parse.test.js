/**
 * Final check m1: the generator reads an existing generated profile whatever
 * its JSON holds. It used to stop at the first `;`, so for a controller id such
 * as "…Pad; Rev 2" the layout guard and the merge with the existing profile
 * were silently skipped. Temp directories only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processControllerDefs } from '../../scripts/process-controller-defs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHIPPED_CAPTURE = path.join(ROOT, 'src', 'input', 'controller_definitions', 'captures', '054c-0ce6_PS5.json');

const temps = [];
afterEach(() => { for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-parse-'));
  temps.push(dir);
  const ws = { capturesDir: path.join(dir, 'captures'), defsDir: path.join(dir, 'profiles'), outFile: path.join(dir, 'index.js') };
  fs.mkdirSync(ws.capturesDir);
  fs.mkdirSync(ws.defsDir);
  return ws;
}

/** The shipped capture, re-labelled as a raw capture of controller `id`. */
function capture(id, { buttons, axes }) {
  const c = JSON.parse(fs.readFileSync(SHIPPED_CAPTURE, 'utf8'));
  Object.assign(c.runMeta.targetController, { id, mapping: '', buttons, axes });
  return c;
}

const write = (ws, json) => fs.writeFileSync(path.join(ws.capturesDir, '1234-abcd_pad.json'), JSON.stringify(json, null, 2));
const run = (ws, extra = {}) => processControllerDefs({ ...ws, log: () => {}, ...extra });
const profilePath = (ws) => path.join(ws.defsDir, '1234-abcd.js');

const IDS = [
  '1234-abcd-Pad; Rev 2',
  '1234-abcd-Pad "Pro" Edition',
  '1234-abcd-Pad\\Rev\\2',
  '1234-abcd-Pad {left} [right]',
  '1234-abcd-Pad */ end of comment',
  '1234-abcd-Pad; "x"; {y}; \\z */',
];

describe('the generator reads an existing profile whatever its JSON holds', () => {
  for (const id of IDS) {
    it(`id ${JSON.stringify(id)}: a layout change of the existing profile is refused without --replace-layout`, () => {
      const ws = workspace();
      write(ws, capture(id, { buttons: 14, axes: 12 }));
      expect(run(ws).errors).toEqual([]);
      expect(fs.readFileSync(profilePath(ws), 'utf8')).toContain(JSON.stringify(id).slice(1, -1));

      write(ws, capture(id, { buttons: 18, axes: 4 }));
      const refused = run(ws);
      expect(refused.errors).toHaveLength(1);
      expect(refused.errors[0]).toMatch(/14 buttons \/ 12 axes.*18 buttons \/ 4 axes.*--replace-layout/);
      expect(fs.readFileSync(profilePath(ws), 'utf8')).toMatch(/"sourceButtons": 14/);

      expect(run(ws, { replaceLayout: true }).errors).toEqual([]);
      expect(fs.readFileSync(profilePath(ws), 'utf8')).toMatch(/"sourceButtons": 18/);
    });
  }

  it('the merge with the existing profile keeps its entries for such an id', () => {
    const ws = workspace();
    const id = '1234-abcd-Pad; Rev 2';
    write(ws, capture(id, { buttons: 14, axes: 12 }));
    expect(run(ws).errors).toEqual([]);
    // an entry the capture does not have, added to the generated profile
    const text = fs.readFileSync(profilePath(ws), 'utf8')
      .replace('"mapping": {', '"mapping": {\n    "GP_B23": { "kind": "button", "index": 13 },');
    fs.writeFileSync(profilePath(ws), text);
    expect(run(ws).errors).toEqual([]);
    expect(fs.readFileSync(profilePath(ws), 'utf8')).toMatch(/"GP_B23": \{\s*"kind": "button",\s*"index": 13/);
  });

  it('a CRLF copy of the profile is read too', () => {
    const ws = workspace();
    const id = '1234-abcd-Pad; Rev 2';
    write(ws, capture(id, { buttons: 14, axes: 12 }));
    expect(run(ws).errors).toEqual([]);
    fs.writeFileSync(profilePath(ws), fs.readFileSync(profilePath(ws), 'utf8').replace(/\n/g, '\r\n'));
    write(ws, capture(id, { buttons: 18, axes: 4 }));
    expect(run(ws).errors[0]).toMatch(/--replace-layout/);
  });

  it('an existing profile file that cannot be read is an error, not a silent skip', () => {
    const ws = workspace();
    fs.writeFileSync(profilePath(ws), 'export const controllerDefinition = { not json };\n\nexport default controllerDefinition;\n');
    write(ws, capture('1234-abcd-Pad', { buttons: 18, axes: 4 }));
    const result = run(ws);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/1234-abcd\.js could not be read/);
    expect(fs.existsSync(ws.outFile)).toBe(false);
  });
});
