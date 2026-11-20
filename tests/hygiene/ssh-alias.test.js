// @vitest-environment node
// m5: a host that starts with `-` is never handed to ssh (it would be read as
// an option such as -F<file> or -oProxyCommand=...); it counts as
// unresolvable, so a path ending in the public <owner>/<repo> is public.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';

const { owner, name } = hp.PUBLIC_REPO;

describe('ssh -G hardening', () => {
  it('never resolves a host that looks like an option, and fails closed', () => {
    const calls = [];
    const spy = (host) => { calls.push(host); return null; };
    for (const url of [
      `ssh://-oProxyCommand=whatever/${owner}/${name}.git`,
      `git@-Fconfigfile:${owner}/${name}.git`,
      `ssh://git@-F${os.tmpdir().replace(/[\\:]/g, '_')}/${owner}/${name}`,
    ]) {
      expect({ url, pub: hp.isPublicRemote(url, hp.PUBLIC_REPO_PATH, { resolveSshHost: spy }) }).toEqual({ url, pub: true });
    }
    expect(calls).toEqual([]);
  });

  it('the real resolver returns null for such a host without running anything', () => {
    const marker = path.join(os.tmpdir(), `bm-hygiene-proxy-${process.pid}`);
    const command = `-oProxyCommand=node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')"`;
    expect(hp.resolveSshHostname(command)).toBe(null);
    expect(hp.resolveSshHostname('-FC:/nonexistent/config')).toBe(null);
    expect(fs.existsSync(marker)).toBe(false);
  });
});
