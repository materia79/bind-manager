// @vitest-environment node
// m4: an author, committer or tagger line the parser cannot fully parse
// refuses the push instead of skipping the e-mail check.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, makeScratch } from './helpers.js';

describe('ident parsing', () => {
  it('flags idents it cannot fully parse', () => {
    const head = (author, committer) => Buffer.from(`tree ${'a'.repeat(40)}\n${author}\n${committer}\n\nmsg\n`);
    const ok = 'author A <dev@example.com> 1700000000 +0100';
    const okC = 'committer A <dev@example.com> 1700000000 +0100';
    expect(pp.parseObject(head(ok, okC)).malformed).toEqual([]);
    expect(pp.parseObject(head('author A <dev@example.com> 1700000000', okC)).malformed).toEqual(['author']);
    expect(pp.parseObject(head(ok, 'committer A dev@example.com 1700000000 +0100')).malformed).toEqual(['committer']);
    expect(pp.parseObject(Buffer.from(`tree ${'a'.repeat(40)}\n${okC}\n\nmsg\n`)).malformed).toEqual(['author']);
  });
});

describe.skipIf(!HAS_GIT)('malformed idents in a push', () => {
  let s;
  beforeAll(() => { s = makeScratch('ident'); });
  afterAll(() => s?.cleanup());

  const craft = (authorLine, committerLine) => {
    const tree = s.git(['rev-parse', `${s.base}^{tree}`]);
    const file = path.join(s.tmp, 'commit.txt');
    fs.writeFileSync(file, `tree ${tree}\nparent ${s.base}\n${authorLine}\n${committerLine}\n\ncrafted\n`);
    return s.git(['hash-object', '-t', 'commit', '-w', '--literally', file]);
  };

  it('refuses an author line without a timezone', async () => {
    const sha = craft('author Example Dev <dev@example.com> 1700000000', 'committer Example Dev <dev@example.com> 1700000000 +0000');
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${sha.slice(0, 7)}  author ident malformed`);
  });

  it('refuses a committer line without an e-mail in angle brackets', async () => {
    const sha = craft('author Example Dev <dev@example.com> 1700000000 +0000', 'committer Example Dev dev@example.com 1700000000 +0000');
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain('committer ident malformed');
  });
});
