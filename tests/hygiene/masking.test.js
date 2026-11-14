// @vitest-environment node
// Minor 1: a matched text is never printed, in any location field: paths are
// printed with the matched segment masked, refused ref names and error
// messages are masked too.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';
import { HAS_GIT, TOKEN, ZERO, everywhere, makeScratch, secretPart } from './helpers.js';

const SECRET = secretPart(TOKEN);

describe('masking helpers', () => {
  it('maskText replaces every match, maskPath every touched segment', () => {
    const p = everywhere();
    expect(hp.maskText(`a ${TOKEN} b`, p)).toBe('a [...] b');
    expect(hp.maskPath(`src/${TOKEN}/file.js`, p)).toBe('src/[...]/file.js');
    expect(hp.maskPath(`src/notes-${TOKEN}.md`, p)).toBe('src/[...]');
    expect(hp.maskPath('src/clean/file.js', p)).toBe('src/clean/file.js');
  });
});

describe.skipIf(!HAS_GIT)('masking in hook and CLI output', () => {
  let s;
  beforeAll(() => { s = makeScratch('mask'); });
  afterAll(() => s?.cleanup());

  it('masks a token in a directory name and in a file name', async () => {
    s.branchFromBase('t-paths');
    const sha = s.commit('odd names', { [`docs/${TOKEN}/a.md`]: 'clean\n', [`notes-${TOKEN}.md`]: 'clean\n' });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain('path docs/[...]/a.md  [github-token]');
    expect(res.out).toContain('path [...]  [github-token]');
    expect(res.out).not.toContain(SECRET);
    const lines = [];
    expect(await pp.runCli(['--scan-tree', sha, '--scope', 'everywhere'], { cwd: s.work, log: (l) => lines.push(l) })).toBe(1);
    expect(lines.join('\n')).toContain('[github-token]');
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it('masks the location of a content hit inside a file whose path matches too', async () => {
    s.branchFromBase('t-both');
    const sha = s.commit('both', { [`d/${TOKEN}.txt`]: `${TOKEN}\n` });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]] });
    expect(res.out).toContain('d/[...]:1  [github-token]');
    expect(res.out).not.toContain(SECRET);
  });

  it('masks a refused branch name and a git error naming a secret', async () => {
    const res = await s.seamPush({ refs: [[`refs/heads/feature-${TOKEN}`, s.base, ZERO]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain('refs/heads/feature-[...]');
    expect(res.out).not.toContain(SECRET);
    const lines = [];
    const code = await pp.runCli(['--scan-range', `${TOKEN}..HEAD`], { cwd: s.work, log: (l) => lines.push(l) });
    expect(code).toBe(2);
    expect(lines.join('\n')).not.toContain(SECRET);
  });
});
