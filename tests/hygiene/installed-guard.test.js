// @vitest-environment node
// Blocker 1 and minor 9: setup:git installs the guard outside every checkout
// (<git common dir>/hygiene-hooks, absolute core.hooksPath), so no worktree,
// old commit or edited checkout can lose or replace it. Real pushes, into
// scratch bare repositories only.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HAS_GIT, TOKEN, makeScratch, repoRoot, secretPart } from './helpers.js';

const GUARD = ['pre-push', 'pre-push.mjs', 'hygiene-patterns.mjs'];

describe.skipIf(!HAS_GIT)('installed guard (real pushes, scratch only)', () => {
  let s;
  let installDir;
  beforeAll(() => {
    s = makeScratch('b1');
    installDir = path.join(s.git(['rev-parse', '--path-format=absolute', '--git-common-dir']), 'hygiene-hooks');
  });
  afterAll(() => s?.cleanup());

  it('installs into the git common dir and points core.hooksPath there (absolute, LF)', () => {
    const { report } = s.setup();
    expect(report.ok).toBe(true);
    expect(s.git(['config', '--local', 'core.hooksPath'])).toBe(installDir.split(path.sep).join('/'));
    for (const f of [...GUARD, 'manifest.json']) expect(fs.existsSync(path.join(installDir, f))).toBe(true);
    for (const f of GUARD) expect(fs.readFileSync(path.join(installDir, f), 'utf8')).not.toContain('\r');
    const manifest = JSON.parse(fs.readFileSync(path.join(installDir, 'manifest.json'), 'utf8'));
    expect(manifest).toEqual({ version: expect.any(Number), hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('refuses a real push of a planted token to public main, and lets a clean one through', () => {
    s.branchFromBase('t-token');
    const dirty = s.commit('token', { 'a.txt': `${TOKEN}\n` });
    const refused = s.realPush(['origin', `${dirty}:refs/heads/main`]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('a.txt:1  [github-token]');
    expect(refused.out).not.toContain(secretPart(TOKEN));
    s.branchFromBase('t-clean');
    const clean = s.commit('clean', { 'b.txt': 'b\n' });
    const ok = s.realPush(['origin', `${clean}:refs/heads/main`]);
    expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('hygiene scan clean') });
    expect(s.git(['ls-remote', s.pub, 'refs/heads/main']).split(/\s/)[0]).toBe(clean);
    s.base = clean;
  });

  it('guards a linked worktree at a commit that has no guard files', () => {
    const wt = path.join(s.tmp, 'wt-old');
    s.git(['worktree', 'add', '-q', '-b', 'old-state', wt, s.base]);
    expect(fs.existsSync(path.join(wt, 'scripts'))).toBe(false);
    s.commit('token in old worktree', { 'c.txt': `${TOKEN}\n` }, { cwd: wt });
    const res = s.realPush(['origin', 'HEAD:refs/heads/main'], wt);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('[github-token]');
  });

  it('an edited scripts/pre-push.mjs in the checkout does not replace the installed guard', () => {
    s.branchFromBase('t-edited');
    const sha = s.commit('token', { 'd.txt': `${TOKEN}\n` });
    s.write('scripts/pre-push.mjs', 'export const GUARD_VERSION = 1;\nprocess.exit(0);\n');
    s.write('scripts/hygiene-patterns.mjs', 'export {};\n');
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    fs.rmSync(path.join(s.work, 'scripts'), { recursive: true, force: true });
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('d.txt:1  [github-token]');
    expect(res.out.split('\n').filter((l) => /installed guard/.test(l) && /npm run setup:git/.test(l))).toHaveLength(1);
  });

  it('re-running setup:git restores an altered installed copy, and is idempotent', () => {
    fs.appendFileSync(path.join(installDir, 'pre-push.mjs'), '\n// tampered\n');
    s.setup();
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'pre-push.mjs'), 'utf8').replace(/\r\n/g, '\n');
    expect(fs.readFileSync(path.join(installDir, 'pre-push.mjs'), 'utf8')).toBe(source);
    const a = s.setup();
    const b = s.setup();
    expect(b.report).toEqual(a.report);
    expect(s.git(['config', '--local', '--get-all', 'core.hooksPath']).split('\n')).toHaveLength(1);
  });

  it('works when run from a linked worktree', () => {
    const wt = path.join(s.tmp, 'wt-setup');
    s.git(['worktree', 'add', '-q', '-b', 'setup-state', wt, s.base]);
    const { report } = s.setup({ cwd: wt });
    expect(report.ok).toBe(true);
    expect(report.hooksPath).toBe(installDir.split(path.sep).join('/'));
  });

  it('does not silently replace another core.hooksPath (needs --force)', () => {
    s.git(['config', 'core.hooksPath', '.husky']);
    const refused = s.setup();
    expect(refused.report.ok).toBe(false);
    expect(refused.out).toContain('.husky');
    expect(s.git(['config', 'core.hooksPath'])).toBe('.husky');
    const forced = s.setup({ force: true });
    expect(forced.report.ok).toBe(true);
    expect(forced.out).toContain('.husky');
    expect(s.git(['config', 'core.hooksPath'])).toBe(installDir.split(path.sep).join('/'));
  });

  it('refuses to downgrade a newer installed guard without --force', () => {
    const file = path.join(installDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...manifest, version: 999 }));
    expect(s.setup().report.ok).toBe(false);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(999);
    expect(s.setup({ force: true }).report.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(manifest.version);
  });

  it('writes the installed copy with LF even from a CRLF source (minor 9)', () => {
    const src = path.join(s.tmp, 'src-crlf');
    fs.mkdirSync(path.join(src, 'git-hooks'), { recursive: true });
    for (const rel of ['pre-push.mjs', 'hygiene-patterns.mjs', 'git-hooks/pre-push']) {
      const text = fs.readFileSync(path.join(repoRoot, 'scripts', rel), 'utf8').replace(/\r?\n/g, '\r\n');
      fs.writeFileSync(path.join(src, rel), text);
    }
    expect(s.setup({ sourceDir: src }).report.ok).toBe(true);
    for (const f of GUARD) expect(fs.readFileSync(path.join(installDir, f), 'utf8')).not.toContain('\r');
    s.setup();
  });

  it('.gitattributes pins LF for the hook wrapper and the three guard scripts only (minor 9)', () => {
    const lines = fs.readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8').split(/\r?\n/)
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines).toEqual([
      'scripts/git-hooks/* text eol=lf',
      'scripts/pre-push.mjs text eol=lf',
      'scripts/hygiene-patterns.mjs text eol=lf',
      'scripts/setup-git.mjs text eol=lf',
    ]);
  });
});
