// @vitest-environment node
// Minor 12: git older than 2.31 (no --diff-merges=first-parent) is refused,
// not degraded.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, makeScratch } from './helpers.js';

describe('git version gate', () => {
  it('parses versions and requires 2.31', () => {
    expect(pp.parseGitVersion('git version 2.55.0.windows.5')).toEqual([2, 55, 0]);
    expect(pp.parseGitVersion('git version 2.31.0')).toEqual([2, 31, 0]);
    expect(pp.gitVersionOk('git version 2.31.0')).toBe(true);
    expect(pp.gitVersionOk('git version 2.30.9')).toBe(false);
    expect(pp.gitVersionOk('git version 1.9.5')).toBe(false);
    expect(pp.gitVersionOk('nonsense')).toBe(false);
  });
});

describe.skipIf(!HAS_GIT)('git version gate in the hook', () => {
  let s;
  beforeAll(() => { s = makeScratch('gitver'); });
  afterAll(() => s?.cleanup());

  it('refuses a public push on old git (exit 2)', async () => {
    s.branchFromBase('t-old');
    const sha = s.commit('any', { 'a.txt': 'a\n' });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]], gitVersion: 'git version 2.30.1' });
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/git 2\.31 or newer/);
  });
});
