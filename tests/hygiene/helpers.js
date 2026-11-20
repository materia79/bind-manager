// Shared fixtures of the hygiene tests. Every fake secret is assembled at
// runtime from harmless pieces, so these files pass their own tree scan.
// Scratch repositories live in the OS temp directory; their "remotes" are
// scratch bare repositories, never a real remote.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

import * as hp from '../../scripts/hygiene-patterns.mjs';
import * as pp from '../../scripts/pre-push.mjs';
import * as sg from '../../scripts/setup-git.mjs';

// Real pushes into scratch repositories spawn git, sh, sha256sum and node; on a
// busy machine (or next to the 50 MB noise corpus) that outlasts vitest's 5 s.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HAS_GIT = spawnSync('git', ['--version'], { windowsHide: true }).status === 0;
export const j = (...parts) => parts.join('');
export const ZERO = '0'.repeat(40);

/** One planted example per secret class, each a full line of content. */
export const FAKE = {
  'private-key-block': j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  'github-token': j('const t = "', 'gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', '";'),
  'anthropic-key': j('key: ', 'sk-', 'ant-', 'api03-', 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2'),
  'openai-key': j('OPENAI=', 'sk-', 'proj-', 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4'),
  'aws-access-key-id': j('aws ', 'AK', 'IA', 'Q3EXAMPL7Z5RT2VW'),
  'slack-token': j('slack ', 'xo', 'xb-', '1234567890-abcdefghij'),
  jwt: j('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'dozjgNryP4J3jVmNHl0w5N_XgL0'),
  'npm-token': j('//registry/:_authToken=', 'np', 'm_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'),
  'windows-user-path': j('see C:', '\\Users\\', 'alice', '\\proj\\notes.md'),
};
export const TOKEN = j('gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8');
/** A tail of each planted line that must never appear in output. */
export const secretPart = (line) => line.slice(-16);

export const everywhere = () => hp.buildPatterns({ scope: 'everywhere' });

export const SCRATCH_CONFIG = [
  ['user.name', 'Example Dev'],
  ['user.email', 'dev@example.com'],
  ['core.autocrlf', 'false'],
  ['commit.gpgsign', 'false'],
  ['tag.gpgsign', 'false'],
  ['hygiene.allowedEmail', 'dev@example.com'],
];

export function findSh() {
  if (spawnSync('sh', ['-c', 'exit 0'], { windowsHide: true }).status === 0) return 'sh';
  try {
    // Git for Windows: <root>/mingw64/libexec/git-core -> <root>/bin/sh.exe
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }).trim();
    for (const up of ['../../..', '../../../..']) {
      const candidate = path.resolve(exec, up, 'bin', 'sh.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* no git */ }
  return null;
}

/**
 * A scratch clone with two scratch bare remotes: `origin`, at a path ending
 * in <owner>/<repo> of the public repository (so the real public rule applies
 * to it: a local path of that shape is public, fail closed), and `private`.
 */
export function makeScratch(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `bm-hygiene-${prefix}-`));
  const pub = path.join(tmp, 'pub', hp.PUBLIC_REPO.owner, `${hp.PUBLIC_REPO.name}.git`);
  const priv = path.join(tmp, 'priv', 'scratch-work.git');
  const work = path.join(tmp, 'work');
  fs.mkdirSync(path.dirname(pub), { recursive: true });
  fs.mkdirSync(path.dirname(priv), { recursive: true });
  const git = (args, cwd = work, env) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
  }).trim();
  git(['init', '-q', '--bare', pub], tmp);
  git(['init', '-q', '--bare', priv], tmp);
  git(['init', '-q', '-b', 'main', work], tmp);
  for (const [k, v] of SCRATCH_CONFIG) git(['config', k, v]);
  git(['remote', 'add', 'origin', pub]);
  git(['remote', 'add', 'private', priv]);

  const s = {
    tmp, pub, priv, work, git,
    write(rel, content, cwd = work) {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
      fs.writeFileSync(path.join(cwd, rel), content);
    },
    commit(message, files = {}, { cwd = work, env } = {}) {
      for (const [rel, content] of Object.entries(files)) s.write(rel, content, cwd);
      git(['add', '-A'], cwd);
      git(['commit', '-q', '--allow-empty', '-m', message], cwd, env);
      return git(['rev-parse', 'HEAD'], cwd);
    },
    branchFromBase(name) { git(['checkout', '-q', '-f', '-B', name, s.base]); git(['clean', '-qfdx']); },
    /** The hook function itself, with its stdin built here (nothing is pushed). */
    async seamPush({ refs, url = pub, remoteName = 'origin', patterns = everywhere(), cwd = work, ...extra }) {
      const lines = [];
      const stdin = refs.map(([remoteRef, localSha, remoteSha = ZERO]) => `refs/heads/x ${localSha} ${remoteRef} ${remoteSha}`).join('\n');
      const code = await pp.runPrePush({ remoteName, remoteUrl: url, stdin, cwd, patterns, log: (l) => lines.push(l), ...extra });
      return { code, out: lines.join('\n') };
    },
    /** A real `git push` into the scratch bare repositories. */
    realPush(args, cwd = work) {
      const r = spawnSync('git', ['push', ...args], { cwd, encoding: 'utf8', windowsHide: true });
      return { code: r.status, out: `${r.stdout || ''}\n${r.stderr || ''}` };
    },
    setup(opts = {}) {
      const lines = [];
      const report = sg.setupGit({ cwd: work, log: (l) => lines.push(l), sourceDir: path.join(repoRoot, 'scripts'), ...opts });
      return { report, out: lines.join('\n') };
    },
    cleanup() { fs.rmSync(tmp, { recursive: true, force: true }); },
  };
  s.base = s.commit('initial', { 'README.md': '# scratch\n' });
  git(['push', '-q', 'origin', 'main']); // before any hook is installed
  return s;
}
