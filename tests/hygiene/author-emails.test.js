// @vitest-environment node
// Minor 11: the author and committer e-mail of every new commit must be in
// `hygiene.allowedEmail` (local git config, written by setup:git). A commit
// with another address is refused without printing the address.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { HAS_GIT, makeScratch } from './helpers.js';

describe('e-mail allowlist matching', () => {
  it('matches exact addresses and *@domain entries, case-insensitively', () => {
    const allowed = ['dev@example.com', '*@users.noreply.github.com'];
    expect(hp.emailAllowed('Dev@Example.com', allowed)).toBe(true);
    expect(hp.emailAllowed('123+dev@users.noreply.github.com', allowed)).toBe(true);
    expect(hp.emailAllowed('x@evil-users.noreply.github.com', allowed)).toBe(false);
    expect(hp.emailAllowed('someone@corp.example', allowed)).toBe(false);
    expect(hp.emailAllowed('', allowed)).toBe(false);
  });
});

describe.skipIf(!HAS_GIT)('author and committer e-mails', () => {
  let s;
  beforeAll(() => { s = makeScratch('emails'); });
  afterAll(() => s?.cleanup());

  it('refuses a commit whose author e-mail is not allowed, without printing it', async () => {
    s.branchFromBase('t-author');
    const sha = s.commit('by someone else', { 'a.txt': 'a\n' }, { env: { GIT_AUTHOR_EMAIL: 'someone@corp-internal.example' } });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${sha.slice(0, 7)}  author e-mail not allowed`);
    expect(res.out).not.toContain('corp-internal');
  });

  it('refuses a commit whose committer e-mail is not allowed', async () => {
    s.branchFromBase('t-committer');
    const sha = s.commit('committed elsewhere', { 'b.txt': 'b\n' }, { env: { GIT_COMMITTER_EMAIL: 'ops@corp-internal.example' } });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain('committer e-mail not allowed');
    expect(res.out).not.toContain('corp-internal');
  });

  it('allows GitHub noreply addresses once setup:git has written its defaults', async () => {
    const { report } = s.setup();
    expect(report.allowedEmails).toEqual(['dev@example.com', '*@users.noreply.github.com']);
    s.setup();
    expect(s.git(['config', '--local', '--get-all', 'hygiene.allowedEmail']).split('\n')).toEqual(['dev@example.com', '*@users.noreply.github.com']);
    s.branchFromBase('t-noreply');
    const sha = s.commit('noreply', { 'c.txt': 'c\n' }, { env: { GIT_AUTHOR_EMAIL: '12345+dev@users.noreply.github.com' } });
    expect((await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] })).code).toBe(0);
  });

  it('refuses when no allowlist is configured, pointing at setup:git', async () => {
    s.git(['config', '--local', '--unset-all', 'hygiene.allowedEmail']);
    s.branchFromBase('t-unset');
    const sha = s.commit('plain', { 'd.txt': 'd\n' });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/hygiene\.allowedEmail.*npm run setup:git/);
    s.git(['config', '--local', '--add', 'hygiene.allowedEmail', 'dev@example.com']);
  });
});
