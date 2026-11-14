// @vitest-environment node
// m2: the installed wrapper checks the installed pre-push.mjs and
// hygiene-patterns.mjs against the hashes setup:git wrote, before running
// node, and refuses on a mismatch. Tamper evidence, not tamper proofing: who
// can edit the wrapper can bypass it.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HAS_GIT, makeScratch } from './helpers.js';

describe.skipIf(!HAS_GIT)('installed guard verified by hash', () => {
  let s;
  let installDir;
  beforeAll(() => {
    s = makeScratch('hash');
    s.setup();
    installDir = path.join(s.git(['rev-parse', '--path-format=absolute', '--git-common-dir']), 'hygiene-hooks');
  });
  afterAll(() => s?.cleanup());

  it('writes a hash file for the two scripts', () => {
    const lines = fs.readFileSync(path.join(installDir, 'hashes.sha256'), 'utf8').trim().split('\n');
    expect(lines.map((l) => l.replace(/^[0-9a-f]{64} {2}/, ''))).toEqual(['pre-push.mjs', 'hygiene-patterns.mjs']);
  });

  for (const file of ['pre-push.mjs', 'hygiene-patterns.mjs']) {
    it(`refuses every push when the installed ${file} was edited, and setup:git repairs it`, () => {
      const target = path.join(installDir, file);
      const original = fs.readFileSync(target, 'utf8');
      fs.writeFileSync(target, file === 'pre-push.mjs' ? `process.exit(0);\n${original}` : `${original}\n// edited\n`);
      s.branchFromBase(`t-${file.replace(/\W/g, '')}`);
      const sha = s.commit('clean', { 'a.txt': `${file}\n` });
      const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
      expect(res.code).not.toBe(0);
      expect(res.out).toMatch(/does not match its manifest.*npm run setup:git/);
      s.setup();
      expect(s.realPush(['origin', `${sha}:refs/heads/main`]).code).toBe(0);
      s.base = sha;
    });
  }

  it('refuses when the hash file is missing', () => {
    fs.rmSync(path.join(installDir, 'hashes.sha256'));
    s.branchFromBase('t-nohash');
    const sha = s.commit('clean', { 'b.txt': 'b\n' });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/npm run setup:git/);
    s.setup();
  });
});
