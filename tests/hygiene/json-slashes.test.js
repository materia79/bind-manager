// @vitest-environment node
// m7: JSON-escaped forward slashes (`\/`) do not hide a path, and every branch
// of the encoding detection has a purpose and a test.

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';
import { everywhere, j } from './helpers.js';

describe('JSON-escaped slashes', () => {
  it('catches \\/c\\/Users\\/<name> and C:\\/Users\\/<name>', () => {
    const p = everywhere();
    expect(hp.scanLine(j('"path":"\\/c\\/Users', '\\/alice\\/x"'), p)).toEqual(['windows-user-path']);
    expect(hp.scanLine(j('"path":"C:\\/Users', '\\/alice\\/x"'), p)).toEqual(['windows-user-path']);
    expect(hp.scanLine(j('"p":"\\/home\\/', 'alice\\/x"'), p)).toEqual(['posix-home-path']);
    expect(hp.scanLine(j('"p":"\\/home\\/', 'user\\/x"'), p)).toEqual([]);
  });
});

describe('encoding detection', () => {
  const le = (s) => Buffer.from(s, 'utf16le');
  const be = (s) => { const b = le(s); for (let i = 0; i + 1 < b.length; i += 2) [b[i], b[i + 1]] = [b[i + 1], b[i]]; return b; };
  it('decides by BOM, by the NUL pattern, and defaults to UTF-8', () => {
    expect(pp.detectEncoding(Buffer.concat([Buffer.from([0xff, 0xfe]), le('hi')]))).toBe('utf16le');
    expect(pp.detectEncoding(Buffer.concat([Buffer.from([0xfe, 0xff]), be('hi')]))).toBe('utf16be');
    expect(pp.detectEncoding(le('plain text without a BOM'))).toBe('utf16le');
    expect(pp.detectEncoding(be('plain text without a BOM'))).toBe('utf16be');
    expect(pp.detectEncoding(Buffer.from('a'))).toBe('utf8'); // too short to judge
    expect(pp.detectEncoding(Buffer.from('plain text'))).toBe('utf8');
    expect(pp.detectEncoding(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]))).toBe('utf8');
  });

  it('transcodes BOM-less UTF-16BE files before scanning', async () => {
    async function* one() { yield be(`first line here\n${j('C:', '\\Users\\', 'alice')}\n`); }
    const hits = await pp.scanContentStream(one(), 'be.txt', { patterns: everywhere() });
    expect(hits.map((h) => `${h.where} ${h.pattern}`)).toEqual(['be.txt:2 windows-user-path']);
  });
});
