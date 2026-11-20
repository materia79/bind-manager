// @vitest-environment node
// m1: tag and branch names are published too; a name carrying a secret is
// refused, printed masked.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HAS_GIT, TOKEN, makeScratch, secretPart } from './helpers.js';

// The guard's own lines; git itself echoes the declined ref afterwards.
const guardLines = (out) => out.split('\n').filter((l) => l.startsWith('pre-push:') || l.startsWith('  '));

describe.skipIf(!HAS_GIT)('ref names in a real push', () => {
  let s;
  beforeAll(() => { s = makeScratch('refs'); s.setup(); });
  afterAll(() => s?.cleanup());

  it('refuses a tag whose name carries a token, on a clean commit', () => {
    s.branchFromBase('t-tag');
    s.commit('clean', { 'a.txt': 'a\n' });
    s.git(['tag', `rel-${TOKEN}`]);
    const res = s.realPush(['origin', `refs/tags/rel-${TOKEN}`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/ref refs\/tags\/rel-\[\.\.\.\]\s+\[github-token\]/);
    expect(guardLines(res.out).filter((l) => l.includes(secretPart(TOKEN)))).toEqual([]);
  });

  it('refuses a local branch whose name carries a token, pushed to main', () => {
    s.branchFromBase(`x-${TOKEN}`);
    s.commit('clean', { 'b.txt': 'b\n' });
    const res = s.realPush(['origin', `refs/heads/x-${TOKEN}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/ref refs\/heads\/x-\[\.\.\.\]\s+\[github-token\]/);
    expect(guardLines(res.out).filter((l) => l.includes(secretPart(TOKEN)))).toEqual([]);
  });
});
