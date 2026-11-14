// @vitest-environment node
// N1 / T3: the reviewed escape for a binary false positive, not --no-verify:
// .hygiene-allow-binaries lists `<sha256>  <path>`; it is honoured only for a
// file the scanner classifies as binary, only for exactly that content and
// path, and every push that includes the file prints "allowed binary: <path>".
// It exempts the identity, path and denylist patterns only: private-key blocks
// and provider token shapes are still matched in a listed binary.

import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, TOKEN, j, makeScratch, secretPart } from './helpers.js';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d]);
const HOME = j('C:', '\\Users\\', 'alice', '\\Pictures');
const asset = (tail = '') => Buffer.concat([PNG, Buffer.from(` ${TOKEN} ${tail}`), Buffer.from([0, 1, 2])]);
// A binary whose only hit is a path pattern: what the allow list is for.
const pathAsset = () => Buffer.concat([PNG, Buffer.from(` exported from ${HOME} `), Buffer.from([0, 1, 2])]);

describe('binary allow list parsing', () => {
  it('reads `<sha256>  <path>` lines and ignores comments', () => {
    const h = 'a'.repeat(64);
    const map = pp.parseAllowBinaries(`# reviewed\n${h}  img/shot.png\n\nnot a line\n`);
    expect([...map.entries()]).toEqual([['img/shot.png', new Set([h])]]);
  });
});

describe.skipIf(!HAS_GIT)('binary allow list in a real push', () => {
  let s;
  beforeAll(() => { s = makeScratch('allowbin'); s.setup(); });
  afterAll(() => s?.cleanup());

  it('without an entry the binary is refused', () => {
    s.branchFromBase('t-none');
    const sha = s.commit('asset', { 'img/shot.png': pathAsset() });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('[windows-user-path]');
  });

  it('an entry for exactly that sha and path lets it through and says so', () => {
    s.branchFromBase('t-allowed');
    const content = pathAsset();
    const sha = s.commit('asset', { 'img/shot.png': content, '.hygiene-allow-binaries': `${sha256(content)}  img/shot.png\n` });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect({ code: res.code, out: res.out }).toEqual({ code: 0, out: expect.stringContaining('allowed binary: img/shot.png') });
    s.base = sha;
  });

  it('a listed binary that carries a provider token is still refused (T3)', () => {
    s.branchFromBase('t-listed-token');
    const content = asset();
    const sha = s.commit('asset with token', { 'img/logo.png': content, '.hygiene-allow-binaries': `${sha256(content)}  img/logo.png\n` });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('img/logo.png:1  [github-token]');
    expect(res.out).not.toContain(secretPart(TOKEN));
  });

  it('a text file with a token and one NUL byte, listed with its exact sha, is refused (T3)', () => {
    s.branchFromBase('t-listed-text');
    const content = Buffer.concat([Buffer.from('notes\0\n'), Buffer.from(`key ${TOKEN}\n`)]);
    const sha = s.commit('listed text', { 'notes.dat': content, '.hygiene-allow-binaries': `${sha256(content)}  notes.dat\n` });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('notes.dat:2  [github-token]');
  });

  it('a changed file is scanned again, and so is the same content at another path', () => {
    s.branchFromBase('t-changed');
    const changed = s.commit('asset changed', { 'img/shot.png': Buffer.concat([pathAsset(), Buffer.from('v2')]) });
    const res = s.realPush(['origin', `${changed}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('img/shot.png:1  [windows-user-path]');

    s.branchFromBase('t-moved');
    const moved = s.commit('copied', { 'img/other.png': pathAsset() });
    const res2 = s.realPush(['origin', `${moved}:refs/heads/main`]);
    expect(res2.code).not.toBe(0);
    expect(res2.out).toContain('img/other.png:1  [windows-user-path]');
  });

  it('is not honoured for a text file', () => {
    s.branchFromBase('t-text');
    const text = Buffer.from(`${HOME}\n`);
    const sha = s.commit('text', { 'notes.txt': text, '.hygiene-allow-binaries': `${sha256(text)}  notes.txt\n` });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('notes.txt:1  [windows-user-path]');
  });

  it('is honoured by the tree scan too, and still finds a token there', async () => {
    const lines = [];
    const code = await pp.runCli(['--scan-tree', s.base, '--scope', 'everywhere'], { cwd: s.work, log: (l) => lines.push(l) });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('allowed binary: img/shot.png');

    s.branchFromBase('t-tree-token');
    const content = asset('tree');
    const sha = s.commit('listed token', { 'img/t.png': content, '.hygiene-allow-binaries': `${sha256(content)}  img/t.png\n` });
    const lines2 = [];
    expect(await pp.runCli(['--scan-tree', sha, '--scope', 'everywhere'], { cwd: s.work, log: (l) => lines2.push(l) })).toBe(1);
    expect(lines2.join('\n')).toContain('img/t.png:1  [github-token]');
  });
});
