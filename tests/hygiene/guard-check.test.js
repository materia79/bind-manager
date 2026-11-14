// @vitest-environment node
// m3: a deleted, renamed or damaged install directory makes git run no hook
// at all, silently. The mitigations that exist: `npm run setup:git -- --check`
// exits non-zero, and npm test / npm run hygiene print a warning, whenever
// origin is the public repository and no working installed guard is there.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as sg from '../../scripts/setup-git.mjs';
import { HAS_GIT, makeScratch, repoRoot } from './helpers.js';

describe.skipIf(!HAS_GIT)('guard status check', () => {
  let s;
  let installDir;
  const check = () => spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'setup-git.mjs'), '--check'], {
    cwd: s.work, encoding: 'utf8', windowsHide: true,
  });
  beforeAll(() => {
    s = makeScratch('check');
    installDir = path.join(s.git(['rev-parse', '--path-format=absolute', '--git-common-dir']), 'hygiene-hooks');
  });
  afterAll(() => s?.cleanup());

  it('reports a missing guard before setup:git', () => {
    const status = sg.checkGuard({ cwd: s.work });
    expect(status).toEqual({ applies: true, ok: false, reasons: [expect.stringMatching(/core\.hooksPath is not set/)] });
    expect(sg.guardStatusWarning(s.work)).toMatch(/pre-push guard is NOT active.*npm run setup:git/);
    expect(check().status).toBe(1);
  });

  it('is fine after setup:git', () => {
    s.setup();
    expect(sg.checkGuard({ cwd: s.work })).toEqual({ applies: true, ok: true, reasons: [] });
    expect(sg.guardStatusWarning(s.work)).toBe(null);
    const r = check();
    expect({ status: r.status, out: r.stdout }).toEqual({ status: 0, out: expect.stringContaining('active') });
  });

  it('reports a damaged installed copy', () => {
    fs.appendFileSync(path.join(installDir, 'pre-push.mjs'), '\n// edited\n');
    expect(sg.checkGuard({ cwd: s.work }).reasons).toEqual([expect.stringMatching(/does not match its manifest/)]);
    expect(check().status).toBe(1);
    s.setup();
  });

  it('reports a deleted or renamed install directory', () => {
    fs.renameSync(installDir, `${installDir}-moved`);
    expect(sg.checkGuard({ cwd: s.work }).reasons).toEqual([expect.stringMatching(/does not exist/)]);
    expect(check().status).toBe(1);
    fs.renameSync(`${installDir}-moved`, installDir);
    expect(sg.checkGuard({ cwd: s.work }).ok).toBe(true);
  });

  it('does not apply to a clone whose origin is not the public repository', () => {
    s.git(['remote', 'set-url', 'origin', s.priv]);
    expect(sg.checkGuard({ cwd: s.work })).toEqual({ applies: false, ok: true, reasons: [] });
    s.git(['remote', 'set-url', 'origin', s.pub]);
  });
});
