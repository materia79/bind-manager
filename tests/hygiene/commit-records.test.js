// @vitest-environment node
// Minor 5: commit messages are read from the raw commit objects, so no byte in
// a message (such as \x02) can end it early and hide what follows.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FAKE, HAS_GIT, makeScratch, secretPart } from './helpers.js';

describe.skipIf(!HAS_GIT)('commit message records', () => {
  let s;
  beforeAll(() => { s = makeScratch('records'); });
  afterAll(() => s?.cleanup());

  for (const [label, ch] of [['\\x02', '\x02'], ['\\x01', '\x01'], ['form feed', '\f']]) {
    it(`a ${label} byte in a message does not hide the rest of it`, async () => {
      s.branchFromBase(`t-${label.replace(/\W/g, '')}`);
      const msgFile = path.join(s.tmp, 'msg.txt');
      fs.writeFileSync(msgFile, `fix ${ch} things\n\n${ch}\n${FAKE['slack-token']}\n`);
      s.write('a.txt', 'a\n');
      s.git(['add', '-A']);
      s.git(['commit', '-q', '-F', msgFile]);
      const sha = s.git(['rev-parse', 'HEAD']);
      const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
      expect(res.code).toBe(1);
      expect(res.out).toContain('commit message  [slack-token]');
      expect(res.out).not.toContain(secretPart(FAKE['slack-token']));
    });
  }
});
