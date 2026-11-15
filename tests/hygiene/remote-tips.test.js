// @vitest-environment node
// Final check M2: what the push scan treats as already public. The negatives
// are the remote shas git passes on stdin plus the tips `git ls-remote`
// reports at push time; local tracking refs (refs/remotes/<remote>/*) are not
// trusted, since they can be stale or hand-made. When the remote cannot be
// asked, the push is refused. Real pushes, into scratch bare repositories only.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';
import { FAKE, HAS_GIT, ZERO, findSh, j, makeScratch, secretPart } from './helpers.js';

const SECRET = FAKE['aws-access-key-id'];
const OTHER_EMAIL = { GIT_AUTHOR_EMAIL: 'someone@corp-internal.example', GIT_COMMITTER_EMAIL: 'someone@corp-internal.example' };
const IDENT = { GIT_AUTHOR_NAME: 'Example Dev', GIT_AUTHOR_EMAIL: 'dev@example.com', GIT_COMMITTER_NAME: 'Example Dev', GIT_COMMITTER_EMAIL: 'dev@example.com' };

describe('ls-remote output', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  const C = 'c'.repeat(64);

  it('reads ref lines, peeled tag lines and HEAD; skips symref lines', () => {
    const text = [
      `${A}\tHEAD`,
      'ref: refs/heads/main\tHEAD',
      `${A}\trefs/heads/main`,
      `${B}\trefs/tags/v1`,
      `${A}\trefs/tags/v1^{}`,
      `${C}\trefs/pull/1/head`,
      '',
    ].join('\r\n');
    expect(pp.parseLsRemote(text).sort()).toEqual([A, B, C].sort());
  });

  it('an empty answer is an empty remote', () => {
    expect(pp.parseLsRemote('')).toEqual([]);
  });

  it('throws on anything it cannot read', () => {
    for (const bad of ['fatal: not a repo', `${A} refs/heads/main`, `${A.slice(1)}\trefs/heads/main`, `${A}\t`, '<html>', null]) {
      expect(() => pp.parseLsRemote(bad)).toThrow();
    }
  });
});

describe.skipIf(!HAS_GIT)('what the push treats as already public (real pushes)', () => {
  let s;
  // Publish a ref of the work clone straight into the scratch public bare
  // repository: no hook runs on a fetch into it.
  const publish = (localRef, remoteRef) => s.git(['fetch', '-q', s.work, `+${localRef}:${remoteRef}`], s.pub);
  const lsRemote = (ref) => s.git(['ls-remote', s.pub, ref]);
  const advance = (sha) => { s.base = sha; };

  beforeAll(() => {
    s = makeScratch('tips');
    // The public history already holds commits by an address that is not on
    // this clone's allowlist, as the real public main does.
    for (let i = 0; i < 12; i += 1) s.commit(`old public ${i}`, { [`old${i}.txt`]: `${i}\n` }, { env: OTHER_EMAIL });
    s.git(['push', '-q', 'origin', 'main']); // before the guard is installed
    advance(s.git(['rev-parse', 'HEAD']));
    expect(s.setup().report.ok).toBe(true);
  });
  afterAll(() => s?.cleanup());

  it('control: a planted secret on top of public main is refused', () => {
    s.branchFromBase('t-control');
    const sha = s.commit('control', { 'ctl.txt': `${SECRET}\n` });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('ctl.txt:1  [aws-access-key-id]');
    expect(res.out).not.toContain(secretPart(SECRET));
  });

  it('a stale tracking ref (published, fetched, deleted on the remote) no longer hides its commit, also as a tag', () => {
    s.branchFromBase('retired');
    const sha = s.commit('retired work', { 'stale.txt': `${SECRET}\n` });
    publish('refs/heads/retired', 'refs/heads/retired');
    s.git(['fetch', '-q', 'origin']);
    expect(s.git(['rev-parse', 'refs/remotes/origin/retired'])).toBe(sha);
    s.git(['update-ref', '-d', 'refs/heads/retired'], s.pub); // no fetch --prune: the tracking ref stays
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('stale.txt:1  [aws-access-key-id]');
    expect(lsRemote('refs/heads/main').split(/\s/)[0]).toBe(s.base);

    s.git(['tag', 't-stale', sha]);
    const tag = s.realPush(['origin', 'refs/tags/t-stale']);
    expect(tag.code).not.toBe(0);
    expect(tag.out).toContain('stale.txt:1  [aws-access-key-id]');
    expect(lsRemote('refs/tags/t-stale')).toBe('');
  });

  it('a hand-made tracking ref on a never-public commit does not hide it', () => {
    s.branchFromBase('t-handmade');
    const sha = s.commit('never public', { 'hand.txt': `${SECRET}\n` });
    s.git(['update-ref', 'refs/remotes/origin/x', sha]);
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('hand.txt:1  [aws-access-key-id]');
    s.git(['update-ref', '-d', 'refs/remotes/origin/x']);
  });

  it('a new tag on a commit already on public main: accepted, no history rescan, with no tracking refs at all', async () => {
    for (const ref of s.git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/']).split('\n').filter(Boolean)) {
      s.git(['update-ref', '-d', ref]);
    }
    s.git(['tag', 'v-on-main', s.base]);
    const res = s.realPush(['origin', 'refs/tags/v-on-main']);
    expect({ code: res.code, out: res.out }).toEqual({ code: 0, out: expect.stringContaining('clean (0 new commit(s)') });
    // With only the stdin shas (a remote that reported nothing) the whole
    // history is rescanned and refused on the old commits' e-mails.
    const blind = await s.seamPush({ refs: [['refs/tags/v-blind', s.base, ZERO]], lsRemote: () => '' });
    expect(blind.code).toBe(1);
    expect(blind.out.match(/author e-mail not allowed/g)).toHaveLength(12);
  });

  it('peeled tag lines and HEAD in the answer, and a remote given by URL', () => {
    s.git(['symbolic-ref', 'HEAD', 'refs/heads/main'], s.pub); // as on GitHub: HEAD is listed
    s.git(['tag', '-a', 'v-annotated', '-m', 'release', s.base]);
    expect(s.realPush(['origin', 'refs/tags/v-annotated']).code).toBe(0);
    const answer = s.git(['ls-remote', s.pub]);
    expect(answer).toMatch(/\trefs\/tags\/v-annotated\^\{\}$/m);
    expect(answer).toMatch(/\tHEAD$/m);
    s.branchFromBase('t-url');
    const clean = s.commit('by url', { 'url.txt': 'u\n' });
    const ok = s.realPush([s.pub, `${clean}:refs/heads/main`]);
    expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    advance(clean);
    const dirty = s.commit('dirty by url', { 'url2.txt': `${SECRET}\n` });
    const refused = s.realPush([s.pub, `${dirty}:refs/heads/main`]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('url2.txt:1  [aws-access-key-id]');
  });

  it('a remote tip whose object is not here is dropped from the negatives, without an error', () => {
    const tree = s.git(['rev-parse', `${s.base}^{tree}`], s.pub);
    const foreign = s.git(['commit-tree', tree, '-p', s.base, '-m', 'only on the remote'], s.pub, IDENT);
    s.git(['update-ref', 'refs/pull/7/head', foreign], s.pub);
    expect(spawnSync('git', ['cat-file', '-e', foreign], { cwd: s.work, windowsHide: true }).status).not.toBe(0);
    s.branchFromBase('t-foreign');
    const clean = s.commit('next', { 'next.txt': 'n\n' });
    const ok = s.realPush(['origin', `${clean}:refs/heads/main`]);
    expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    advance(clean);
  });

  it('a deleted ref together with other refs, and a new ref (zero remote sha)', () => {
    s.branchFromBase('t-multi');
    const tagged = s.commit('tagged', { 'tag.txt': 't\n' });
    s.git(['tag', 'v-old', tagged]);
    const newTag = s.realPush(['origin', 'refs/tags/v-old']);
    expect({ code: newTag.code, out: newTag.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    const clean = s.commit('after the tag', { 'tag2.txt': 't2\n' });
    // the tag is still on the remote while the hook runs, so its commit is known
    const both = s.realPush(['origin', ':refs/tags/v-old', `${clean}:refs/heads/main`]);
    expect({ code: both.code, out: both.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    expect(lsRemote('refs/tags/v-old')).toBe('');
    advance(clean);
    s.git(['tag', 'v-old2', clean]);
    expect(s.realPush(['origin', 'refs/tags/v-old2']).code).toBe(0);
    const dirty = s.commit('dirty', { 'tag3.txt': `${SECRET}\n` });
    const refused = s.realPush(['origin', ':refs/tags/v-old2', `${dirty}:refs/heads/main`]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('tag3.txt:1  [aws-access-key-id]');
    expect(lsRemote('refs/tags/v-old2')).not.toBe('');
  });

  it('an empty remote: everything is scanned', () => {
    const empty = path.join(s.tmp, 'empty', hp.PUBLIC_REPO.owner, `${hp.PUBLIC_REPO.name}.git`);
    fs.mkdirSync(path.dirname(empty), { recursive: true });
    s.git(['init', '-q', '--bare', empty], s.tmp);
    const res = s.realPush([empty, `${s.base}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out.match(/author e-mail not allowed/g)).toHaveLength(12);
    expect(s.git(['ls-remote', empty])).toBe('');
  });

  it('the rewrite rule and the e-mail check still work', () => {
    s.git(['checkout', '-q', '-f', '-B', 't-rewrite', `${s.base}~1`]);
    const behind = s.commit('not a fast-forward', { 'rw.txt': 'r\n' });
    const res = s.realPush(['--force', 'origin', `${behind}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/rewrite published history/);
    s.branchFromBase('t-email');
    const foreign = s.commit('foreign e-mail', { 'em.txt': 'e\n' }, { env: OTHER_EMAIL });
    const refused = s.realPush(['origin', `${foreign}:refs/heads/main`]);
    expect(refused.code).not.toBe(0);
    expect(refused.out.match(/author e-mail not allowed/g)).toHaveLength(1);
    expect(refused.out).not.toContain('corp-internal');
  });

  it('a remote with thousands of refs: one ls-remote per push, bounded time', async () => {
    const lines = [];
    for (let i = 0; i < 3000; i += 1) lines.push(`create refs/tags/many-${i} ${s.base}`);
    execFileSync('git', ['update-ref', '--stdin'], { cwd: s.pub, input: `${lines.join('\n')}\n`, windowsHide: true });
    expect(s.git(['ls-remote', s.pub]).split('\n').length).toBeGreaterThan(3000);
    s.branchFromBase('t-many');
    const clean = s.commit('many', { 'many.txt': 'm\n' });
    const started = Date.now();
    const ok = s.realPush(['origin', `${clean}:refs/heads/main`]);
    const took = Date.now() - started;
    expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    expect(took).toBeLessThan(30_000);
    advance(clean);
    let calls = 0;
    const next = s.commit('two refs', { 'm2.txt': 'm\n' });
    s.git(['tag', 'v-many', next]);
    const res = await s.seamPush({
      refs: [['refs/heads/main', next, s.base], ['refs/tags/v-many', next, ZERO]],
      lsRemote: (target, cwd) => { calls += 1; return pp.gitLsRemote(target, cwd); },
    });
    expect({ code: res.code, out: res.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    expect(calls).toBe(1);
  });
});

describe.skipIf(!HAS_GIT)('fail closed when the remote cannot be asked', () => {
  let s;
  beforeAll(() => { s = makeScratch('tips-fail'); });
  afterAll(() => s?.cleanup());

  it('refuses when ls-remote fails, times out or answers something unreadable', async () => {
    s.branchFromBase('t-fail');
    const sha = s.commit('clean', { 'a.txt': 'a\n' });
    const refs = [['refs/heads/main', sha, s.base]];
    const failed = await s.seamPush({ refs, lsRemote: () => { throw Object.assign(new Error('fatal: unable to access'), { status: 128 }); } });
    expect(failed.code).toBe(2);
    expect(failed.out).toMatch(/could not ask the public remote/);
    expect(failed.out).toMatch(/needs the network/);
    expect(failed.out).not.toContain('unable to access');
    const timedOut = await s.seamPush({ refs, lsRemote: () => { throw Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }); } });
    expect(timedOut.code).toBe(2);
    expect(timedOut.out).toMatch(/timed out/);
    const garbled = await s.seamPush({ refs, lsRemote: () => 'this is not ls-remote output\n' });
    expect(garbled.code).toBe(2);
    expect(garbled.out).toMatch(/could not ask the public remote/);
  });

  it('refuses with the real git when the public remote is not reachable', async () => {
    s.branchFromBase('t-unreachable');
    const sha = s.commit('clean', { 'b.txt': 'b\n' });
    const gone = path.join(s.tmp, 'gone', hp.PUBLIC_REPO.owner, `${hp.PUBLIC_REPO.name}.git`);
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]], url: gone });
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/could not ask the public remote/);
  });

  it('a push that only deletes needs no answer from the remote', async () => {
    const res = await s.seamPush({ refs: [['refs/tags/v-gone', ZERO, s.base]], lsRemote: () => { throw new Error('offline'); } });
    expect(res.code).toBe(0);
  });

  it('a push to another remote never asks', async () => {
    let calls = 0;
    const res = await s.seamPush({ refs: [['refs/heads/wip', s.base, ZERO]], url: s.priv, remoteName: 'private', lsRemote: () => { calls += 1; return ''; } });
    expect(res).toEqual({ code: 0, out: '' });
    expect(calls).toBe(0);
  });
});

// Guard re-check B1: `git ls-remote <push url>` applies fetch rewriting
// (url.<base>.insteadOf) to the URL git handed the hook, so it can ask another
// repository than the one receiving the push. The guard asks only when
// `git ls-remote --get-url` names the same repository; otherwise it refuses.

const OWNER = hp.PUBLIC_REPO.owner;
const NAME = hp.PUBLIC_REPO.name;

describe('the repository a remote URL names', () => {
  it('one identity for the public repository however it is spelled', () => {
    const forms = [
      `https://github.com/${OWNER}/${NAME}`,
      `https://github.com/${OWNER}/${NAME}.git`,
      `https://github.com/${OWNER}/${NAME}/`,
      `https://${j('user', ':', 'pw')}@github.com/${OWNER.toUpperCase()}/${NAME}.git`,
      `https://www.github.com/${OWNER}/${NAME}`,
      `https://github.com:443/${OWNER}/${NAME}`,
      `https://GitHub.com./${OWNER}/${NAME}`,
      `git@github.com:${OWNER}/${NAME}.git`,
      `ssh://git@github.com/${OWNER}/${NAME}.git`,
      `ssh://git@ssh.github.com:443/${OWNER}/${NAME}.git`,
      `git://github.com/${OWNER}/${NAME}.git`,
    ];
    expect(new Set(forms.map((url) => pp.remoteIdentity(url))).size).toBe(1);
  });

  it('another repository is another identity', () => {
    const pub = pp.remoteIdentity(`https://github.com/${OWNER}/${NAME}`);
    for (const other of [
      `https://github.com/${OWNER}/${NAME}-private`,
      `https://github.com/someone-else/${NAME}`,
      `https://gitlab.com/${OWNER}/${NAME}`,
      `/srv/mirror/${OWNER}/${NAME}.git`,
    ]) expect(pp.remoteIdentity(other), other).not.toBe(pub);
  });

  it('local paths: relative, absolute, file:// and a trailing .git or slash name one directory', () => {
    const base = path.resolve('scratch-root');
    const abs = path.join(base, 'pub', OWNER, `${NAME}.git`);
    const id = pp.remoteIdentity(abs, base);
    expect(pp.remoteIdentity(`pub/${OWNER}/${NAME}.git`, base)).toBe(id);
    expect(pp.remoteIdentity(`${abs}${path.sep}`, base)).toBe(id);
    expect(pp.remoteIdentity(path.join(base, 'pub', OWNER, NAME), base)).toBe(id);
    expect(pp.remoteIdentity(`file:///${abs.split(path.sep).join('/').replace(/^\//, '')}`, base)).toBe(id);
    expect(pp.remoteIdentity(path.join(base, 'priv', `${NAME}.git`), base)).not.toBe(id);
  });

  it('masks credentials and an scp user other than git, nothing else', () => {
    expect(pp.maskUrl(`https://${j('user', ':', 'pw')}@github.com/a/b`)).toBe('https://***@github.com/a/b');
    expect(pp.maskUrl('alice@build-host:a/b')).toBe('***@build-host:a/b');
    expect(pp.maskUrl('git@github.com:a/b')).toBe('git@github.com:a/b');
    expect(pp.maskUrl('https://github.com/a/b')).toBe('https://github.com/a/b');
    expect(pp.maskUrl('origin')).toBe('origin');
  });
});

describe.skipIf(!HAS_GIT)('the guard asks only the repository that receives the push (real pushes)', () => {
  let s;
  const mainOf = (repo) => s.git(['rev-parse', 'refs/heads/main'], repo);
  const withConfig = (pairs, fn) => {
    for (const [key, value] of pairs) s.git(['config', key, value]);
    try { return fn(); } finally { for (const [key] of pairs) s.git(['config', '--unset-all', key]); }
  };
  // A commit with a planted line that is a branch tip on the private repository.
  const secretOnPrivate = (branch, file) => {
    s.branchFromBase(branch);
    const sha = s.commit(`private ${branch}`, { [file]: `${SECRET}\n` });
    expect(s.realPush(['private', `${branch}:refs/heads/${branch}`]).code).toBe(0);
    return sha;
  };

  beforeAll(() => {
    s = makeScratch('asked');
    expect(s.setup().report.ok).toBe(true);
  });
  afterAll(() => s?.cleanup());

  it('N09: fetches of the public URL rewritten to the private mirror, pushes left public: refused, nothing published', () => {
    const before = mainOf(s.pub);
    const sha = secretOnPrivate('secretbr', 'p.txt');
    const res = withConfig([[`url.${s.priv}.insteadOf`, s.pub], [`url.${s.pub}.pushInsteadOf`, s.pub]],
      () => s.realPush(['origin', 'secretbr:main']));
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/could not ask the public remote "origin"/);
    expect(res.out).toMatch(/url\.\*\.insteadOf/);
    expect(res.out).not.toMatch(/hygiene scan clean/);
    expect(mainOf(s.pub)).toBe(before);
    expect(spawnSync('git', ['cat-file', '-e', sha], { cwd: s.pub, windowsHide: true }).status).not.toBe(0);
  });

  it('the hook exits 2 for it, and the message names both URLs without credentials', async () => {
    const pubUrl = `https://${j('user', ':', 'pw')}@github.com/${OWNER}/${NAME}`;
    const res = await s.seamPush({
      refs: [['refs/heads/main', s.base, s.base]],
      url: pubUrl,
      lsRemoteGetUrl: () => `https://${j('user', ':', 'pw')}@mirror.example/${OWNER}/${NAME}`,
      lsRemote: () => { throw new Error('must not be asked'); },
    });
    expect(res.code).toBe(2);
    expect(res.out).toContain(`https://***@github.com/${OWNER}/${NAME}`);
    expect(res.out).toContain('mirror.example');
    expect(res.out).not.toContain(j('user', ':', 'pw'));
  });

  it('git ls-remote --get-url failing refuses (exit 2)', async () => {
    const res = await s.seamPush({ refs: [['refs/heads/main', s.base, s.base]], lsRemoteGetUrl: () => { throw new Error('boom'); } });
    expect(res.code).toBe(2);
    expect(res.out).toMatch(/could not ask the public remote/);
  });

  it('the same repository spelled another way (push rewritten to one spelling, fetch to another): asked and scanned as normal', () => {
    // A local stand-in for ssh vs https: the plain path for pushes, the file:// URL for fetches.
    const fileUrl = `file:///${s.pub.split(path.sep).join('/').replace(/^\//, '')}`;
    withConfig([[`url.${fileUrl}.insteadOf`, s.pub], [`url.${s.pub}.pushInsteadOf`, s.pub]], () => {
      expect(s.git(['ls-remote', '--get-url', s.pub])).toBe(fileUrl);
      s.branchFromBase('t-spelling');
      const clean = s.commit('clean', { 'sp.txt': 's\n' });
      const ok = s.realPush(['origin', `${clean}:refs/heads/main`]);
      expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
      s.base = clean;
      const dirty = s.commit('dirty', { 'sp2.txt': `${SECRET}\n` });
      const refused = s.realPush(['origin', `${dirty}:refs/heads/main`]);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain('sp2.txt:1  [aws-access-key-id]');
    });
  });

  it('an explicit pushurl rewritten to the private repository: the push goes private, the hook does nothing', () => {
    const before = mainOf(s.pub);
    s.git(['config', 'remote.origin.pushurl', s.pub]);
    try {
      const sha = secretOnPrivate('t-pushurl-src', 'pu.txt');
      const res = withConfig([[`url.${s.priv}.insteadOf`, s.pub]], () => s.realPush(['origin', `${sha}:refs/heads/pushed-here`]));
      expect({ code: res.code, out: res.out }).toEqual({ code: 0, out: expect.not.stringContaining('pre-push') });
      expect(s.git(['rev-parse', 'refs/heads/pushed-here'], s.priv)).toBe(sha);
      expect(mainOf(s.pub)).toBe(before);
    } finally { s.git(['config', '--unset', 'remote.origin.pushurl']); }
  });

  it('a remote whose pushurl (public) differs from its url (private): the push URL is asked', () => {
    const sha = secretOnPrivate('t-split', 'split.txt');
    s.git(['remote', 'add', 'split', s.priv]);
    s.git(['config', 'remote.split.pushurl', s.pub]);
    try {
      s.git(['fetch', '-q', 'split']);
      expect(s.git(['ls-remote', '--get-url', s.pub])).toBe(s.pub);
      const res = s.realPush(['split', `${sha}:refs/heads/main`]);
      expect(res.code).not.toBe(0);
      expect(res.out).toContain('split.txt:1  [aws-access-key-id]');
    } finally { s.git(['remote', 'remove', 'split']); }
  });

  it('a relative URL pushed from a subdirectory behaves as before', () => {
    const rel = path.relative(s.work, s.pub);
    s.git(['remote', 'add', 'rel', rel]);
    try {
      fs.mkdirSync(path.join(s.work, 'sub'), { recursive: true });
      s.branchFromBase('t-rel');
      const clean = s.commit('clean rel', { 'rel.txt': 'r\n' });
      const sub = path.join(s.work, 'sub');
      fs.mkdirSync(sub, { recursive: true });
      const ok = s.realPush(['rel', `${clean}:refs/heads/main`], sub);
      expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
      s.base = clean;
      const dirty = s.commit('dirty rel', { 'rel2.txt': `${SECRET}\n` });
      fs.mkdirSync(sub, { recursive: true });
      const refused = s.realPush(['rel', `${dirty}:refs/heads/main`], sub);
      expect(refused.code).not.toBe(0);
      expect(refused.out).toContain('rel2.txt:1  [aws-access-key-id]');
    } finally { s.git(['remote', 'remove', 'rel']); }
  });

  it('a plain public remote with no rewrites behaves as before', () => {
    s.branchFromBase('t-plain');
    const clean = s.commit('clean plain', { 'pl.txt': 'p\n' });
    const ok = s.realPush(['origin', `${clean}:refs/heads/main`]);
    expect({ code: ok.code, out: ok.out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit(s)') });
    s.base = clean;
    const dirty = s.commit('dirty plain', { 'pl2.txt': `${SECRET}\n` });
    const refused = s.realPush(['origin', `${dirty}:refs/heads/main`]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain('pl2.txt:1  [aws-access-key-id]');
  });
});
