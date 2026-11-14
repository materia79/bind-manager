// @vitest-environment node
// The hygiene gate: nothing private or secret in the tracked tree, the built
// bundles or the npm package, and the pre-push guard behaves as documented.
// Patterns live in scripts/hygiene-patterns.mjs, the hook in scripts/pre-push.mjs.
//
// Every fake secret below is assembled at runtime from harmless pieces, so this
// file passes its own tree scan. Hook tests run in scratch repositories in the
// OS temp directory with scratch bare repositories as remotes; nothing here
// talks to a real remote.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUBLIC_REPO,
  PUBLIC_REPO_PATH,
  buildAccountPatterns,
  buildDenylistPatterns,
  buildHostPatterns,
  buildPatterns,
  loadDenylist,
  looksLikeSecretValue,
  parseDenylist,
  scanLine,
} from '../../scripts/hygiene-patterns.mjs';
import {
  checkPublicRefs,
  formatHit,
  runPrePush,
  ALLOW_BINARIES_FILE,
  parseAllowBinaries,
  scanFile,
} from '../../scripts/pre-push.mjs';
import { setupGit } from '../../scripts/setup-git.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HAS_GIT = spawnSync('git', ['--version'], { windowsHide: true }).status === 0;
if (!HAS_GIT) console.warn('[hygiene] git is not available: the tree scan and the hook tests are SKIPPED.');

// CI cannot know the host identity, the gh account or the local denylist.
const IN_CI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const TREE_SCOPE = IN_CI ? 'everywhere' : 'all';

const j = (...parts) => parts.join('');
const ZERO = '0'.repeat(40);

// One planted example per pattern class, each a full line of content.
const FAKE = {
  'private-key-block': j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
  'github-token': j('const t = "', 'gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', '";'),
  'anthropic-key': j('key: ', 'sk-', 'ant-', 'api03-', 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2'),
  'openai-key': j('OPENAI=', 'sk-', 'proj-', 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4'),
  'aws-access-key-id': j('aws ', 'AK', 'IA', 'Q3EXAMPL7Z5RT2VW'),
  'slack-token': j('slack ', 'xo', 'xb-', '1234567890-abcdefghij'),
  jwt: j('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'dozjgNryP4J3jVmNHl0w5N_XgL0'),
  'bearer-token': j('Authori', 'zation: ', 'Bearer ', 'a8F3kL9qZ2xV7mN4pR6tY1wB5cD0eG3h'),
  'npm-token': j('//registry/:_authToken=', 'np', 'm_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'),
  'generic-secret-assignment': j('const api', 'Key = "', 'q8Zr2LmX5vT9wB3nK7pD', '";'),
  'windows-user-path': j('see C:', '\\Users\\', 'alice', '\\proj\\notes.md'),
  'worktree-root-path': j('cd D:', '\\wt\\', 'proj'),
  'posix-home-path': j('cd /ho', 'me/', 'alice/proj'),
  'posix-root-home': j('cat /ro', 'ot/', '.ssh/known'),
};
// The secret-ish part of each line that must never appear in hook output.
const secretPart = (line) => line.replace(/^[^A-Za-z0-9/\\-]*/, '').slice(-16);

const everywhere = () => buildPatterns({ scope: 'everywhere' });

// ---- patterns: true positives and tuned-away false positives --------------

describe('hygiene patterns', () => {
  it.each(Object.entries(FAKE))('%s is detected', (name, line) => {
    expect(scanLine(line, everywhere())).toContain(name);
  });

  it('detects the other shapes of each class', () => {
    const p = everywhere();
    expect(scanLine(j('-----BEGIN ', 'OPENSSH PRIVATE', ' KEY-----'), p)).toContain('private-key-block');
    expect(scanLine(j('-----BEGIN ', 'PGP PRIVATE KEY', ' BLOCK-----'), p)).toContain('private-key-block');
    expect(scanLine(j('github', '_pat_', '11ABCDEFG0', 'a1b2c3d4e5'.repeat(5)), p)).toContain('github-token');
    for (const prefix of ['gho_', 'ghu_', 'ghs_', 'ghr_']) {
      expect(scanLine(j(prefix, 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4'), p)).toContain('github-token');
    }
    expect(scanLine(j('xo', 'xp-', '99887766-aabbccddee'), p)).toContain('slack-token');
    expect(scanLine(j('headers: { Authori', 'zation: "', 'Bearer ', 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3"', ' }'), p)).toContain('bearer-token');
    expect(scanLine(j('pass', 'word: \'', 'Hq7!Lw2#Rt9$Mz4%', '\''), p)).toContain('password-assignment');
    expect(scanLine(j('CLIENT_SECRET', '="', 'Zq81mPx0Lw2kVt7rYb4n', '"'), p)).toContain('password-assignment');
    // Windows paths in every spelling: forward slashes, JSON-escaped, lower case, URL-encoded.
    expect(scanLine(j('C:', '/Users/', 'alice/x'), p)).toContain('windows-user-path');
    expect(scanLine(j('"C:', '\\\\Users\\\\', 'alice\\\\x"'), p)).toContain('windows-user-path');
    expect(scanLine(j('e:', '\\users\\', 'alice'), p)).toContain('windows-user-path');
    expect(scanLine(j('/api/file?path=C', '%3A%2FUsers%2F', 'alice%2Fx'), p)).toContain('windows-user-path');
    expect(scanLine(j('"D:', '\\\\wt\\\\', 'x"'), p)).toContain('worktree-root-path');
    expect(scanLine(j('C:', '/git/', 'x'), p)).toContain('worktree-root-path');
    expect(scanLine(j('/Us', 'ers/', 'alice/Library'), p)).toContain('posix-home-path');
  });

  it('does not flag the shapes this code base has legitimately', () => {
    const p = everywhere();
    const clean = [
      // CSS design tokens and custom properties
      '  --bm-token-accent: #1e90ffcc;',
      'const tokens = { radius: "var(--bm-radius-md)", accentToken: "--bm-color-accent-strong" };',
      "token: 'GP_B0',",
      'token: "bm-modal-overlay-panel-background",',
      'const ACCESS_KEY = "BIND_MANAGER_STORAGE_V2";',
      // hex colours, long hex, numbers
      "accentToken: '#a1b2c3d4e5f60718',",
      'password: "",',
      'apiKey: "your-api-key-goes-here-123",',
      'token = "${process.env.NPM_TOKEN}"',
      // base64 data in the demo
      'src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="',
      // kebab-case class names that start with sk-, and sk inside words
      '.sk-modal-overlay-container-wrapper { display: none; }',
      'const task-1234567890abcdefghijklmnop = 1;',
      // bearer with a variable, not a literal
      'headers: { Authorization: `Bearer ${token}` }',
      // documentation placeholders in paths
      String.raw`C:\Users\you\projects`,
      String.raw`C:\Users\<name>\projects`,
      '/home/user/project and /Users/<user>/project and /home/<name>/x',
      String.raw`%USERPROFILE% is C:\Users\%USERNAME%`,
      '/home/runner/work/bind-manager',
      // CSS :root, and words that merely contain wt / git
      ':root { --bm-x: 1px; }',
      'https://github.com/a/b/tree/main/src',
      // the public repository itself
      `https://${PUBLIC_REPO_PATH}/releases/download/main-latest/bind-manager.min.js`,
    ];
    for (const line of clean) expect({ line, hits: scanLine(line, p) }).toEqual({ line, hits: [] });
  });

  it('looksLikeSecretValue keeps identifiers and colours out', () => {
    expect(looksLikeSecretValue('q8Zr2LmX5vT9wB3nK7pD')).toBe(true);
    expect(looksLikeSecretValue('controller-binding-v2-x')).toBe(false);
    expect(looksLikeSecretValue('#ffffff00ffffff00')).toBe(false);
    expect(looksLikeSecretValue('GP_B0_LABEL_TEXT')).toBe(false);
    expect(looksLikeSecretValue('aaaaaaaaaaaaaaaa1')).toBe(false);
  });

  it('host identity patterns come from the identity passed in', () => {
    const identity = { hostname: 'build-box-17', username: 'alice', homedir: j('C:', '\\Users\\', 'alice') };
    const p = buildHostPatterns(identity);
    expect(p.map((x) => x.name)).toEqual(['host-name', 'host-username', 'host-homedir']);
    expect(p.every((x) => x.scope === 'local-only')).toBe(true);
    expect(scanLine('ssh build-box-17.local', p)).toContain('host-name');
    expect(scanLine('build-box-170', p)).toContain('host-name'); // 5+ characters: also inside compound names
    expect(scanLine('by Alice', p)).toContain('host-username');
    expect(scanLine('malice', p)).toContain('host-username'); // the price of catching compound names
    expect(scanLine(j('"C:', '\\\\Users\\\\', 'alice\\\\x"'), p)).toContain('host-homedir');
    expect(scanLine(j('C:', '/Users/', 'alice/x'), p)).toContain('host-homedir');
    // generic and too-short identities produce no pattern
    expect(buildHostPatterns({ hostname: 'localhost', username: 'dev', homedir: '/home/dev' })).toEqual([]);
    expect(buildHostPatterns({ hostname: 'ab', username: 'bob', homedir: '' })).toEqual([]);
  });

  it('the account pattern spares the public repository and flags everything else', () => {
    const owner = PUBLIC_REPO.owner;
    const p = buildAccountPatterns(owner);
    expect(p).toHaveLength(1);
    const ok = [
      `https://github.com/${owner}/${PUBLIC_REPO.name}`,
      `git@github.com:${owner}/${PUBLIC_REPO.name}.git`,
      `https://github.com/${owner}/${PUBLIC_REPO.name}/releases`,
      `https://${owner}.github.io/projects/${PUBLIC_REPO.name}/`,
    ];
    for (const line of ok) expect({ line, hits: scanLine(line, p) }).toEqual({ line, hits: [] });
    const bad = [
      `https://github.com/${owner}/some-other-repo`,
      `https://github.com/${owner}/${PUBLIC_REPO.name}-work`,
      `signed in as ${owner}`,
    ];
    for (const line of bad) expect(scanLine(line, p)).toEqual(['github-account']);
    // An account that is not the owner gets no exemption at all.
    expect(scanLine(`https://github.com/example-person/${PUBLIC_REPO.name}`, buildAccountPatterns('example-person')))
      .toEqual(['github-account']);
    expect(buildAccountPatterns('')).toEqual([]);
  });

  it('the allow marker covers exactly the named pattern on exactly that line', () => {
    const p = everywhere();
    const line = FAKE['github-token'];
    expect(scanLine(`${line} // hygiene-allow: github-token`, p)).toEqual([]);
    expect(scanLine(`${line} // hygiene-allow: jwt`, p)).toEqual(['github-token']);
    expect(scanLine(`${line} ${FAKE['aws-access-key-id']} // hygiene-allow: github-token`, p)).toEqual(['aws-access-key-id']);
    expect(scanLine(`${line} ${FAKE['aws-access-key-id']} // hygiene-allow: github-token, aws-access-key-id`, p)).toEqual([]);
  });

  it('parses the denylist format', () => {
    const { entries, errors } = parseDenylist('# comment\n\nproject-nebula\n/acme-\\d+/i\n/(unclosed/\n');
    expect(entries.map((e) => e.line)).toEqual([3, 4]);
    expect(errors).toEqual([5]);
    const p = buildDenylistPatterns({ entries });
    expect(scanLine('see Project-Nebula notes', p)).toEqual(['denylist-line-3']);
    expect(scanLine('project-nebulas', p)).toEqual(['denylist-line-3']); // 5+ characters: substring
    expect(scanLine('ticket ACME-42', p)).toEqual(['denylist-line-4']);
  });

  it('the everywhere scope holds no machine-derived pattern', () => {
    const p = everywhere();
    expect(p.every((x) => x.scope === 'everywhere')).toBe(true);
    const names = p.map((x) => x.name);
    for (const name of ['host-name', 'host-username', 'host-homedir', 'github-account']) expect(names).not.toContain(name);
  });

  it('allows only main and tags to the public remote', () => {
    const ref = (remoteRef, localSha = 'a'.repeat(40)) => ({ localRef: 'x', localSha, remoteRef, remoteSha: ZERO });
    expect(checkPublicRefs([ref('refs/heads/main'), ref('refs/tags/v1.0.0'), ref('refs/tags/old', ZERO)])).toEqual([]);
    expect(checkPublicRefs([ref('refs/heads/dev')])).toHaveLength(1);
    expect(checkPublicRefs([ref('refs/heads/review-fixes')])).toHaveLength(1);
    expect(checkPublicRefs([ref('refs/heads/main', ZERO)])[0]).toMatch(/deleting the public main/);
    expect(checkPublicRefs([ref('refs/heads/dev', ZERO)])).toHaveLength(1);
  });
});

// ---- the tree, the bundles and the package --------------------------------

async function scanAll(files, patterns) {
  const hits = [];
  // Reviewed binaries (.hygiene-allow-binaries) are honoured as in the hook.
  let listed = '';
  try { listed = fs.readFileSync(path.join(repoRoot, ALLOW_BINARIES_FILE), 'utf8'); } catch { /* none */ }
  const allowBinaries = parseAllowBinaries(listed);
  for (const { abs, rel } of files) hits.push(...await scanFile(abs, rel, { patterns, allowBinaries }));
  return hits.map(formatHit);
}

describe.skipIf(!HAS_GIT)('hygiene of what gets published', () => {
  const patterns = buildPatterns({ scope: TREE_SCOPE, repoRoot });

  it(`every tracked file is clean (scope: ${TREE_SCOPE})`, async () => {
    const listed = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
    const files = listed.split('\0').filter((rel) => rel && !rel.split('/').includes('node_modules'))
      .map((rel) => ({ rel, abs: path.join(repoRoot, rel) }))
      .filter(({ abs }) => fs.existsSync(abs));
    expect(files.length).toBeGreaterThan(50);
    expect(await scanAll(files, patterns), 'file:line [pattern]').toEqual([]);
  });

  it('the built bundles are clean (when built)', async () => {
    const bundles = ['dist/bind-manager.js', 'dist/bind-manager.min.js']
      .map((rel) => ({ rel, abs: path.join(repoRoot, rel) }));
    const present = bundles.filter(({ abs }) => fs.existsSync(abs));
    for (const { rel } of bundles.filter((b) => !present.includes(b))) {
      console.info(`[hygiene] ${rel} is not built; run npm run build to scan it.`);
    }
    expect(await scanAll(present, patterns), 'file:line [pattern]').toEqual([]);
  });

  it('every file npm pack would publish is clean', async () => {
    const out = execSync('npm pack --dry-run --json --ignore-scripts', {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true, timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = JSON.parse(out)[0].files.map((f) => ({ rel: f.path, abs: path.join(repoRoot, f.path) }));
    expect(files.some((f) => f.rel === 'package.json')).toBe(true);
    expect(await scanAll(files, patterns), 'file:line [pattern]').toEqual([]);
  }, 60_000);
});

// ---- the hook, in scratch repositories ------------------------------------

describe.skipIf(!HAS_GIT)('pre-push guard', () => {
  let tmp;
  let work;
  let publicUrl;
  let privateUrl;
  let base;

  const git = (args, cwd = work) => execFileSync('git', args, {
    cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true });
    fs.writeFileSync(path.join(work, rel), content);
  };
  const commit = (message, files = {}) => {
    for (const [rel, content] of Object.entries(files)) write(rel, content);
    git(['add', '-A']);
    git(['commit', '-q', '--allow-empty', '-m', message]);
    return git(['rev-parse', 'HEAD']);
  };
  const branchFromBase = (name) => git(['checkout', '-q', '-B', name, base]);

  async function push({ refs, url = publicUrl, remoteName = 'origin', patterns = everywhere(), ...extra }) {
    const lines = [];
    const stdin = refs.map(([remoteRef, localSha, remoteSha = ZERO]) => `refs/heads/x ${localSha} ${remoteRef} ${remoteSha}`).join('\n');
    const code = await runPrePush({
      remoteName, remoteUrl: url, stdin, cwd: work, patterns, log: (l) => lines.push(l), ...extra,
    });
    return { code, out: lines.join('\n') };
  }

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-hygiene-'));
    // A local path ending in <owner>/<repo> of the public repository is
    // public (fail closed), so the real rule applies to this scratch remote.
    publicUrl = path.join(tmp, 'pub', PUBLIC_REPO.owner, `${PUBLIC_REPO.name}.git`);
    fs.mkdirSync(path.dirname(publicUrl), { recursive: true });
    privateUrl = path.join(tmp, 'private.git');
    work = path.join(tmp, 'work');
    git(['init', '-q', '--bare', publicUrl], tmp);
    git(['init', '-q', '--bare', privateUrl], tmp);
    git(['init', '-q', '-b', 'main', work], tmp);
    for (const [k, v] of [['user.name', 'Example Dev'], ['user.email', 'dev@example.com'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false'], ['hygiene.allowedEmail', 'dev@example.com']]) {
      git(['config', k, v]);
    }
    git(['remote', 'add', 'origin', publicUrl]);
    git(['remote', 'add', 'private', privateUrl]);
    // The public history already holds a line that a later commit removes.
    base = commit('initial', { 'README.md': '# scratch\n', 'old.txt': `keep\n${FAKE['aws-access-key-id']}\n` });
    git(['push', '-q', 'origin', 'main']); // scratch bare repo, no hooks configured here
  });

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('refuses each planted secret class in an added line, naming the pattern and never the secret', async () => {
    branchFromBase('t-classes');
    const names = Object.keys(FAKE);
    const sha = commit('add notes', { 'notes.txt': `${names.map((n) => FAKE[n]).join('\n')}\n` });
    const { code, out } = await push({ refs: [['refs/heads/main', sha, base]] });
    expect(code).toBe(1);
    names.forEach((name, idx) => {
      expect(out).toContain(`notes.txt:${idx + 1}  [${name}]`);
      expect(out).not.toContain(secretPart(FAKE[name]));
    });
    expect(out).toContain(sha.slice(0, 7));
  });

  it('passes a secret that is only in a removed line', async () => {
    branchFromBase('t-removed');
    const sha = commit('drop the old line', { 'old.txt': 'keep\n' });
    const { code, out } = await push({ refs: [['refs/heads/main', sha, base]] });
    expect({ code, out }).toEqual({ code: 0, out: expect.stringContaining('clean (1 new commit') });
  });

  it('refuses a secret in a commit message', async () => {
    branchFromBase('t-message');
    const sha = commit(`fix\n\n${FAKE['slack-token']}`, { 'a.txt': 'a\n' });
    const { code, out } = await push({ refs: [['refs/heads/main', sha, base]] });
    expect(code).toBe(1);
    expect(out).toContain('commit message  [slack-token]');
    expect(out).not.toContain(secretPart(FAKE['slack-token']));
  });

  it('refuses a non-main branch and the deletion of main on the public remote', async () => {
    branchFromBase('t-branch');
    const sha = commit('clean', { 'b.txt': 'b\n' });
    const branch = await push({ refs: [['refs/heads/feature', sha]] });
    expect(branch.code).toBe(1);
    expect(branch.out).toMatch(/refs\/heads\/feature: the public repository takes only main and tags/);
    const dev = await push({ refs: [['refs/heads/dev', sha, base]] });
    expect(dev.code).toBe(1);
    const del = await push({ refs: [['refs/heads/main', ZERO, base]] });
    expect(del.code).toBe(1);
    expect(del.out).toMatch(/deleting the public main/);
  });

  it('allows tags and scans them (lightweight and annotated)', async () => {
    branchFromBase('t-tags');
    const clean = commit('clean for tag', { 'c.txt': 'c\n' });
    git(['tag', 'v-light']);
    expect((await push({ refs: [['refs/tags/v-light', clean]] })).code).toBe(0);

    git(['tag', '-a', 'v-annotated', '-m', `release\n\n${FAKE['npm-token']}`]);
    const tagObject = git(['rev-parse', 'v-annotated']);
    const annotated = await push({ refs: [['refs/tags/v-annotated', tagObject]] });
    expect(annotated.code).toBe(1);
    expect(annotated.out).toContain('tag message  [npm-token]');
    expect(annotated.out).not.toContain(secretPart(FAKE['npm-token']));

    const dirty = commit('dirty for tag', { 'd.txt': `${FAKE.jwt}\n` });
    git(['tag', 'v-dirty']);
    const tagged = await push({ refs: [['refs/tags/v-dirty', dirty]] });
    expect(tagged.code).toBe(1);
    expect(tagged.out).toContain('d.txt:1  [jwt]');
  });

  it('lets a push to the private remote through, planted secret and all', async () => {
    branchFromBase('t-private');
    const sha = commit('wip', { 'e.txt': `${FAKE['github-token']}\n` });
    const res = await push({ refs: [['refs/heads/t-private', sha]], url: privateUrl, remoteName: 'private' });
    expect(res).toEqual({ code: 0, out: '' });
    // and with the real public URL as the default, another repository of the owner is not public
    const real = await runPrePush({
      remoteName: 'private',
      remoteUrl: `https://github.com/${PUBLIC_REPO.owner}/scratch-work.git`,
      stdin: `refs/heads/t-private ${sha} refs/heads/t-private ${ZERO}`,
      cwd: work,
      log: () => {},
    });
    expect(real).toBe(0);
  });

  it('handles a new ref (zero remote sha): only commits the remote does not have are scanned', async () => {
    branchFromBase('t-newref');
    const sha = commit('one new commit', { 'f.txt': 'f\n' });
    const clean = await push({ refs: [['refs/heads/main', sha]] });
    expect(clean.code).toBe(0);
    expect(clean.out).toContain('clean (1 new commit');
    const dirty = commit('second', { 'g.txt': `${FAKE['openai-key']}\n` });
    const res = await push({ refs: [['refs/heads/main', dirty]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain('g.txt:1  [openai-key]');
  });

  it('handles a force push (rewrite rule off): the rewritten commits are scanned', async () => {
    branchFromBase('t-force-a');
    const published = commit('published', { 'h.txt': 'h\n' });
    branchFromBase('t-force-b');
    const rewritten = commit('rewritten', { 'h.txt': `${FAKE['anthropic-key']}\n` });
    const res = await push({ refs: [['refs/heads/main', rewritten, published]], refuseRewrite: false });
    expect(res.code).toBe(1);
    expect(res.out).toContain('h.txt:1  [anthropic-key]');
    // a later commit that removes it does not help: the rewritten history still carries it
    const fixed = commit('remove it again', { 'h.txt': 'h2\n' });
    expect((await push({ refs: [['refs/heads/main', fixed, published]], refuseRewrite: false })).code).toBe(1);
    branchFromBase('t-force-c');
    const cleanRewrite = commit('clean rewrite', { 'h.txt': 'h3\n' });
    expect((await push({ refs: [['refs/heads/main', cleanRewrite, published]], refuseRewrite: false })).code).toBe(0);
  });

  it('handles merge commits: the merged commits and what the merge itself adds', async () => {
    branchFromBase('t-merge-side');
    const side = commit('side work', { 'side.txt': `${FAKE['generic-secret-assignment']}\n` });
    branchFromBase('t-merge-main');
    commit('main work', { 'main.txt': 'm\n' });
    git(['merge', '-q', '--no-ff', '--no-edit', 't-merge-side']);
    const merged = git(['rev-parse', 'HEAD']);
    const res = await push({ refs: [['refs/heads/main', merged, base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain(`${side.slice(0, 7)}  side.txt:1  [generic-secret-assignment]`);

    // an "evil merge": the secret appears only in the merge commit's own changes
    branchFromBase('t-evil-side');
    commit('clean side', { 'side2.txt': 's\n' });
    branchFromBase('t-evil-main');
    commit('clean main', { 'main2.txt': 'm\n' });
    git(['merge', '-q', '--no-ff', '--no-commit', 't-evil-side']);
    write('main2.txt', `m\n${FAKE['private-key-block']}\n`);
    git(['add', '-A']);
    git(['commit', '-q', '--no-edit']);
    const evil = git(['rev-parse', 'HEAD']);
    const res2 = await push({ refs: [['refs/heads/main', evil, base]] });
    expect(res2.code).toBe(1);
    expect(res2.out).toContain(`${evil.slice(0, 7)}  main2.txt:2  [private-key-block]`);
  });

  it('scans paths, and binary content too', async () => {
    branchFromBase('t-binary');
    write('blob.bin', Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(FAKE['github-token'])]));
    const sha = commit('binary', { [`docs/notes-${j('AK', 'IA', 'Q3EXAMPL7Z5RT2VW')}.md`]: 'x\n' });
    const res = await push({ refs: [['refs/heads/main', sha, base]] });
    expect(res.code).toBe(1);
    expect(res.out).toContain('[aws-access-key-id]');
    expect(res.out).toContain('blob.bin:1  [github-token]');
  });

  it('honours the allow marker for exactly the named pattern on exactly that line', async () => {
    branchFromBase('t-allow');
    const line = FAKE['github-token'];
    const sha = commit('allowed', {
      'k.txt': `${line} // hygiene-allow: github-token\n${line} // hygiene-allow: jwt\n${line}\n`,
    });
    const res = await push({ refs: [['refs/heads/main', sha, base]] });
    expect(res.code).toBe(1);
    expect(res.out).not.toContain('k.txt:1');
    expect(res.out).toContain('k.txt:2  [github-token]');
    expect(res.out).toContain('k.txt:3  [github-token]');
  });

  it('honours a denylist entry, without printing it', async () => {
    branchFromBase('t-deny');
    const term = j('Project', '-Nebula');
    const sha = commit('mention', { 'n.txt': `see ${term} for details\n` });
    const denylist = parseDenylist(`# names\n${term.toLowerCase()}\n`);
    const patterns = [...everywhere(), ...buildDenylistPatterns(denylist)];
    const res = await push({ refs: [['refs/heads/main', sha, base]], patterns });
    expect(res.code).toBe(1);
    expect(res.out).toContain('n.txt:1  [denylist-line-2]');
    expect(res.out.toLowerCase()).not.toContain(term.toLowerCase());
    // a scratch checkout without a denylist says so in one line and still scans
    expect(loadDenylist(work).found).toBe(false);
    const lines = [];
    const code = await runPrePush({
      remoteName: 'origin', remoteUrl: publicUrl, cwd: work, log: (l) => lines.push(l),
      stdin: `refs/heads/x ${sha} refs/heads/main ${base}`,
    });
    expect(code).toBe(0);
    expect(lines.filter((l) => l.includes('no local denylist'))).toHaveLength(1);
  });

  it('setup:git in a scratch clone sets hooksPath and pushDefault, idempotently', () => {
    const clone = path.join(tmp, 'clone');
    git(['clone', '-q', publicUrl, clone], tmp);
    fs.copyFileSync(path.join(repoRoot, '.hygiene-denylist.example'), path.join(clone, '.hygiene-denylist.example'));
    const lines = [];
    const first = setupGit({ cwd: clone, log: (l) => lines.push(l) });
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], clone);
    expect(git(['config', '--local', 'core.hooksPath'], clone)).toBe(path.join(common, 'hygiene-hooks').split(path.sep).join('/'));
    expect(first.pushDefault).toBe(null);
    expect(spawnSync('git', ['config', '--local', 'remote.pushDefault'], { cwd: clone }).status).not.toBe(0);
    expect(lines.join('\n')).toMatch(/no remote named "private"/);
    expect(first.originPublic).toBe(true); // a path ending in <owner>/<repo> counts as public
    expect(fs.existsSync(path.join(clone, '.hygiene-denylist'))).toBe(true);

    git(['remote', 'add', 'private', privateUrl], clone);
    fs.writeFileSync(path.join(clone, '.hygiene-denylist'), 'my-own-entry\n');
    const second = setupGit({ cwd: clone, log: () => {} });
    const third = setupGit({ cwd: clone, log: () => {} });
    expect(second.pushDefault).toBe('private');
    expect(third).toEqual(second);
    expect(git(['config', '--local', 'remote.pushDefault'], clone)).toBe('private');
    expect(fs.readFileSync(path.join(clone, '.hygiene-denylist'), 'utf8')).toBe('my-own-entry\n');
  });
});
