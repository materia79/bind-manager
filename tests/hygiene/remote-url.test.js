// @vitest-environment node
// Minor 2: the public remote is recognised in every tested URL form; SSH host
// aliases are resolved with `ssh -G` (stubbed here), and an alias that cannot
// be resolved, or a local path ending in <owner>/<repo>, counts as public
// (fail closed).

import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';

const { owner, name } = hp.PUBLIC_REPO;
const stub = (map) => (host) => (Object.hasOwn(map, host) ? map[host] : null);
const isPub = (url, map = {}) => hp.isPublicRemote(url, hp.PUBLIC_REPO_PATH, { resolveSshHost: stub(map) });

describe('public remote URL forms', () => {
  it('recognises the public repository in every tested form', () => {
    const encodedOwner = [...owner].map((c) => `%${c.charCodeAt(0).toString(16)}`).join('');
    for (const url of [
      `https://github.com/${owner}/${name}`,
      `https://github.com/${owner}/${name}.git`,
      `https://GitHub.com/${owner.toUpperCase()}/${name}/`,
      `https://token@github.com/${owner}/${name}.git`,
      `https://github.com./${owner}/${name}`,
      `https://www.github.com/${owner}/${name}`,
      `https://github.com//${owner}//${name}.git`,
      `https://github.com/${encodedOwner}/${name}`,
      `https://github.com/${owner}/${name}?tab=readme`,
      `https://github.com/${owner}/${name}#readme`,
      `git://github.com/${owner}/${name}.git`,
      `git@github.com:${owner}/${name}.git`,
      `ssh://git@github.com/${owner}/${name}`,
      `ssh://git@github.com:22/${owner}/${name}.git`,
      `ssh://git@ssh.github.com:443/${owner}/${name}.git`,
    ]) expect({ url, pub: isPub(url) }).toEqual({ url, pub: true });
  });

  it('resolves SSH host aliases, and fails closed when an alias cannot be resolved', () => {
    expect(isPub(`git@github-work:${owner}/${name}.git`, { 'github-work': 'github.com' })).toBe(true);
    expect(isPub(`git@gh443:${owner}/${name}.git`, { gh443: 'ssh.github.com' })).toBe(true);
    expect(isPub(`git@github-work:${owner}/${name}.git`, {})).toBe(true); // unresolvable: fail closed
    expect(isPub(`git@github-work:${owner}/${name}.git`, { 'github-work': 'github-work' })).toBe(true);
    expect(isPub(`git@mirror:${owner}/${name}.git`, { mirror: 'git.example.org' })).toBe(false);
    expect(isPub(`git@gitlab.com:${owner}/${name}.git`, { 'gitlab.com': 'gitlab.com' })).toBe(false);
  });

  it('treats a local path or file URL ending in <owner>/<repo> as public (fail closed)', () => {
    expect(isPub(`/srv/mirror/${owner}/${name}.git`)).toBe(true);
    expect(isPub(`file:///srv/mirror/${owner}/${name}.git`)).toBe(true);
    expect(isPub(`D:\\mirror\\${owner}\\${name}.git`)).toBe(true);
    expect(isPub('/srv/mirror/scratch.git')).toBe(false);
  });

  it('does not treat other repositories as public', () => {
    for (const url of [
      `https://github.com/${owner}/${name}-work`,
      `https://github.com/someone-else/${name}`,
      `https://gitlab.com/${owner}/${name}`,
      `https://github.com/mirror/${owner}/${name}`,
      `git@github.com:${owner}/other.git`,
      '../scratch/public.git',
      '',
    ]) expect({ url, pub: isPub(url) }).toEqual({ url, pub: false });
  });

  it('is re-exported by the hook module', () => {
    expect(pp.isPublicRemote).toBe(hp.isPublicRemote);
  });
});
