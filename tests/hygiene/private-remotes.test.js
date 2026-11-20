// @vitest-environment node
// Major 2: the private repository's name and URL are private. The patterns
// for them are derived at runtime from the repository's own remotes,
// `local-only`; no tracked file holds a rule the name could be computed from.
// Only synthetic names appear here.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import { HAS_GIT, everywhere, makeScratch, repoRoot } from './helpers.js';

describe('private remote names', () => {
  it('derives owner/repo, a distinctive repo name and a private host from non-public remotes', () => {
    const { owner, name } = hp.PUBLIC_REPO;
    const p = hp.buildRemotePatterns([
      `https://github.com/${owner}/${name}.git`,
      'https://git.example.org/example-owner/secret-lab-notes.git',
      'git@github.com:example-owner/work.git',
      '../local/scratch.git',
    ]);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x.name === 'private-remote' && x.scope === 'local-only')).toBe(true);
    expect(hp.scanLine('see Secret-Lab-Notes', p)).toEqual(['private-remote']);
    expect(hp.scanLine('clone example-owner/work', p)).toEqual(['private-remote']);
    expect(hp.scanLine('host git.example.org is down', p)).toEqual(['private-remote']);
    expect(hp.scanLine('back to work', p)).toEqual([]); // a generic repo name alone is not flagged
    expect(hp.scanLine(`https://github.com/${owner}/${name}`, p)).toEqual([]);
    expect(hp.scanLine('scratch', p)).toEqual([]);
  });

  it('is not part of the everywhere set, and no fixed private-repo rule remains', () => {
    const names = everywhere().map((x) => x.name);
    expect(names).not.toContain('private-remote');
    expect(names).not.toContain('private-repo-name');
    expect(hp.buildPrivateRepoPattern).toBeUndefined();
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'hygiene-patterns.mjs'), 'utf8');
    expect(source).not.toMatch(/-private`/);
  });
});

describe.skipIf(!HAS_GIT)('private remote names in a scratch repository', () => {
  let s;
  beforeAll(() => {
    s = makeScratch('remotes');
    s.git(['remote', 'add', 'mirror', 'https://git.example.org/example-owner/secret-lab-notes.git']); // never contacted
  });
  afterAll(() => s?.cleanup());

  it('reads the remotes of the repository and refuses a commit naming the private one', async () => {
    const patterns = hp.buildPatterns({ repoRoot: s.work, identity: {}, account: '', denylist: { entries: [] } });
    expect(patterns.some((x) => x.name === 'private-remote')).toBe(true);
    s.branchFromBase('t-remote');
    const sha = s.commit('notes', { 'n.md': 'mirrored from secret-lab-notes\n' });
    const res = await s.seamPush({ refs: [['refs/heads/main', sha, s.base]], patterns });
    expect(res.code).toBe(1);
    expect(res.out).toContain('n.md:1  [private-remote]');
    expect(res.out).not.toContain('secret-lab-notes');
  });
});
