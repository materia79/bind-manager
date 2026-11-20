// @vitest-environment node
// Minor 10: a push to public main that is not a fast-forward is refused
// (behind the REFUSE_PUBLIC_MAIN_REWRITE constant). Deleting main stays refused.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import { FAKE, HAS_GIT, ZERO, makeScratch } from './helpers.js';

const ref = (localSha, remoteSha) => ({ localRef: 'x', localSha, remoteRef: 'refs/heads/main', remoteSha });
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('public main rewrites', () => {
  it('is on by default, behind one constant', () => {
    expect(pp.REFUSE_PUBLIC_MAIN_REWRITE).toBe(true);
  });

  it('refuses a non-fast-forward, allows a fast-forward and a new ref', () => {
    expect(pp.checkPublicRefs([ref(A, B)], { isAncestor: () => false })[0]).toMatch(/rewrite/);
    expect(pp.checkPublicRefs([ref(A, B)], { isAncestor: () => true })).toEqual([]);
    expect(pp.checkPublicRefs([ref(A, ZERO)], { isAncestor: () => false })).toEqual([]);
    expect(pp.checkPublicRefs([ref(A, B)], { isAncestor: () => false, refuseRewrite: false })).toEqual([]);
    expect(pp.checkPublicRefs([ref(ZERO, B)], { isAncestor: () => true })[0]).toMatch(/deleting the public main/);
  });
});

describe.skipIf(!HAS_GIT)('public main rewrites in scratch', () => {
  let s;
  beforeAll(() => {
    s = makeScratch('rewrite');
    s.setup();
  });
  afterAll(() => s?.cleanup());

  it('refuses a real force push to public main', () => {
    s.branchFromBase('t-a');
    const published = s.commit('published', { 'a.txt': 'a\n' });
    expect(s.realPush(['origin', `${published}:refs/heads/main`]).code).toBe(0);
    s.branchFromBase('t-b');
    const other = s.commit('rewritten', { 'a.txt': 'b\n' });
    const res = s.realPush(['--force', 'origin', `${other}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/rewrite published history/);
  });

  it('with the rule off, the rewritten commits are still scanned', async () => {
    s.branchFromBase('t-c');
    const published = s.commit('published', { 'h.txt': 'h\n' });
    s.branchFromBase('t-d');
    const rewritten = s.commit('rewritten', { 'h.txt': `${FAKE['anthropic-key']}\n` });
    const res = await s.seamPush({ refs: [['refs/heads/main', rewritten, published]], refuseRewrite: false });
    expect(res.code).toBe(1);
    expect(res.out).toContain('h.txt:1  [anthropic-key]');
  });
});
