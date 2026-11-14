// @vitest-environment node
// N1: random bytes cannot produce a hit, while a real leak inside binary data
// is still caught. In lines holding NUL or other control bytes, and in the
// NUL-dropped and UTF-16 readings, a pattern only counts inside a run of 8+
// printable characters, and names shorter than 6 characters are not applied.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, TOKEN, j, makeScratch, secretPart } from './helpers.js';

const HOME = j('C:', '\\Users\\', 'alice', '\\notes');
const LONG_HOST = 'buildbox9';

/** Seeded xorshift32 bytes: the same corpus on every run, never committed. */
function noise(bytes, seed) {
  const out = Buffer.allocUnsafe(bytes);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < bytes; i += 4) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out.writeUInt32LE(x, Math.min(i, bytes - 4));
  }
  return out;
}

async function* chunked(buf, size = 1 << 20) {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

const identityPatterns = (hostname, username) => hp.buildPatterns({
  identity: { hostname, username, homedir: '' },
  account: 'zqk',
  denylist: hp.parseDenylist('qwv\n'),
  remotes: [],
  email: '',
});

describe('binary noise', () => {
  it('50 MB of seeded random data gives no hit with a 3-letter or a 4-letter host name', async () => {
    const corpus = [];
    for (let i = 0; i < 50; i += 1) corpus.push(noise(1 << 20, 0x9e3779b9 + i));
    for (const [hostname, username] of [['kq7', 'jmpr'], ['vxz9', 'zeta7q']]) {
      const patterns = identityPatterns(hostname, username);
      let hits = 0;
      for (const [i, buf] of corpus.entries()) {
        hits += (await pp.scanContentStream(chunked(buf), `noise-${i}.bin`, { patterns })).length;
      }
      expect({ hostname, hits }).toEqual({ hostname, hits: 0 });
    }
  }, 180_000);

  it('still finds a token, a home path and a 9-character host name inside binary data, as ASCII and as UTF-16', async () => {
    const patterns = identityPatterns(LONG_HOST, 'nobodyx');
    const wrap = (inner) => Buffer.concat([noise(3000, 7).fill(0, 0, 4), Buffer.from([0, 0x89]), inner, Buffer.from([0, 0xfe]), noise(3000, 8)]);
    const cases = [
      ['ascii token', Buffer.from(` ${TOKEN} `), 'github-token'],
      ['utf16 token', Buffer.from(` ${TOKEN} `, 'utf16le'), 'github-token'],
      ['ascii home', Buffer.from(` ${HOME} `), 'windows-user-path'],
      ['utf16 home', Buffer.from(` ${HOME} `, 'utf16le'), 'windows-user-path'],
      ['ascii host', Buffer.from(` ssh ${LONG_HOST} `), 'host-name'],
      ['utf16 host', Buffer.from(` ssh ${LONG_HOST} `, 'utf16le'), 'host-name'],
    ];
    for (const [label, inner, pattern] of cases) {
      const hits = await pp.scanContentStream(chunked(wrap(inner)), 'asset.bin', { patterns });
      expect({ label, names: [...new Set(hits.map((h) => h.pattern))] }).toEqual({ label, names: expect.arrayContaining([pattern]) });
    }
  });

  it('a short host name inside a clean text line is still caught', async () => {
    const patterns = identityPatterns('kq7', 'jmpr');
    const hits = await pp.scanContentStream(chunked(Buffer.from('deploy to kq7 tonight\n')), 'notes.md', { patterns });
    expect(hits.map((h) => h.pattern)).toEqual(['host-name']);
  });
});

describe.skipIf(!HAS_GIT)('binary leaks in a real push', () => {
  let s;
  beforeAll(() => { s = makeScratch('noise'); s.setup(); });
  afterAll(() => s?.cleanup());

  it('refuses a token and a home path embedded in binary data (ASCII and UTF-16)', () => {
    s.branchFromBase('t-embedded');
    const blob = Buffer.concat([
      noise(5000, 3), Buffer.from([0]), Buffer.from(` ${TOKEN} `), Buffer.from([0, 1]),
      noise(5000, 4), Buffer.from([0]), Buffer.from(` ${HOME} `, 'utf16le'), Buffer.from([0, 2]), noise(5000, 5),
    ]);
    const sha = s.commit('asset', { 'asset.bin': blob });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('[github-token]');
    expect(res.out).toContain('[windows-user-path]');
    expect(res.out).not.toContain(secretPart(TOKEN));
  });

  it('lets 4 MB of random binary data through', () => {
    s.branchFromBase('t-noise');
    const sha = s.commit('noise', { 'noise.bin': Buffer.concat([noise(4 << 20, 11)]) });
    const res = s.realPush(['origin', `${sha}:refs/heads/main`]);
    expect({ code: res.code, out: res.out }).toEqual({ code: 0, out: expect.stringContaining('hygiene scan clean') });
    s.base = sha;
  });
});
