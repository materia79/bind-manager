// @vitest-environment node
// Guard re-check m1: an installed guard older than the checkout's keeps the
// old behaviour. `npm run setup:git -- --check` (and the test banner) now say
// so, and the installed hook refuses a PUBLIC push while the checkout carries
// a newer guard version. Real pushes, into scratch bare repositories only.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import * as sg from '../../scripts/setup-git.mjs';
import { guardBanner } from './guard-banner.mjs';
import { HAS_GIT, makeScratch, repoRoot } from './helpers.js';

describe.skipIf(!HAS_GIT)('installed guard older than the checkout', () => {
  let s;
  let installDir;
  const manifestFile = () => path.join(installDir, 'manifest.json');
  const setManifestVersion = (version) => {
    const manifest = JSON.parse(fs.readFileSync(manifestFile(), 'utf8'));
    if (version === undefined) delete manifest.version; else manifest.version = version;
    fs.writeFileSync(manifestFile(), JSON.stringify(manifest));
  };
  const check = () => spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'setup-git.mjs'), '--check'], {
    cwd: s.work, encoding: 'utf8', windowsHide: true,
  });

  beforeAll(() => {
    s = makeScratch('version');
    installDir = path.join(s.git(['rev-parse', '--path-format=absolute', '--git-common-dir']), 'hygiene-hooks');
    expect(s.setup().report.ok).toBe(true);
  });
  afterAll(() => s?.cleanup());

  it('the guard version is 5', () => {
    expect(pp.GUARD_VERSION).toBe(5);
  });

  it('--check exits 0 for a current installed guard', () => {
    const r = check();
    expect({ status: r.status, out: r.stdout }).toEqual({ status: 0, out: expect.stringContaining('active') });
  });

  it('--check exits 1 for an older installed guard, naming both versions and the fix; the banner shows it', () => {
    setManifestVersion(pp.GUARD_VERSION - 1);
    try {
      const status = sg.checkGuard({ cwd: s.work });
      expect(status.ok).toBe(false);
      expect(status.reasons).toEqual([`the installed guard (v${pp.GUARD_VERSION - 1}) is older than this checkout's (v${pp.GUARD_VERSION}); run npm run setup:git`]);
      const r = check();
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(`(v${pp.GUARD_VERSION - 1}) is older than this checkout's (v${pp.GUARD_VERSION})`);
      expect(r.stdout).toContain('npm run setup:git');
      expect(guardBanner({ cwd: s.work, env: {} })).toContain(`(v${pp.GUARD_VERSION - 1}) is older`);
    } finally { s.setup(); }
  });

  it('--check exits 1 when the installed manifest has no version', () => {
    setManifestVersion(undefined);
    try {
      expect(sg.checkGuard({ cwd: s.work }).reasons).toEqual([expect.stringMatching(/has no version/)]);
      expect(check().status).toBe(1);
    } finally { s.setup(); }
  });

  it('an installed guard under a newer checkout guard refuses a public push, allows a private one', () => {
    const next = pp.GUARD_VERSION + 1;
    s.branchFromBase('t-newer');
    const clean = s.commit('clean', { 'a.txt': 'a\n' });
    s.write('scripts/pre-push.mjs', `export const GUARD_VERSION = ${next};\n`);
    s.write('scripts/hygiene-patterns.mjs', 'export {};\n');
    try {
      const refused = s.realPush(['origin', `${clean}:refs/heads/main`]);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain(`pre-push: refusing: the installed guard (v${pp.GUARD_VERSION}) is older than this checkout's (v${next}); run npm run setup:git, then push again.`);
      expect(refused.out).not.toContain('hygiene scan clean');
      expect(s.git(['rev-parse', 'refs/heads/main'], s.pub)).toBe(s.base);
      const priv = s.realPush(['private', `${clean}:refs/heads/t-newer`]);
      expect(priv.code).toBe(0);
      expect(priv.out).not.toContain('refusing');
    } finally { fs.rmSync(path.join(s.work, 'scripts'), { recursive: true, force: true }); }
  });

  it('equal versions pass (the checkout carries the same guard)', () => {
    s.branchFromBase('t-equal');
    const clean = s.commit('clean equal', { 'b.txt': 'b\n' });
    fs.mkdirSync(path.join(s.work, 'scripts'), { recursive: true });
    for (const name of ['pre-push.mjs', 'hygiene-patterns.mjs']) fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(s.work, 'scripts', name));
    try {
      const ok = s.realPush(['origin', `${clean}:refs/heads/main`]);
      expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('hygiene scan clean') });
      expect(ok.out).not.toContain('older');
    } finally { fs.rmSync(path.join(s.work, 'scripts'), { recursive: true, force: true }); }
  });
});
