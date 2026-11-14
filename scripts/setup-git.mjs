#!/usr/bin/env node
// One-time git setup for a clone: `npm run setup:git [-- --force]`. Idempotent.
// Re-run it after every update of the guard scripts.
//
//  - installs the guard OUTSIDE every checkout: the wrapper, pre-push.mjs and
//    hygiene-patterns.mjs are copied, with LF line endings, into
//    <git common dir>/hygiene-hooks/, and core.hooksPath is set to that
//    absolute path. The hook then runs for every worktree of this clone,
//    whatever commit it has checked out, and no checkout can replace it;
//  - leaves another core.hooksPath (husky and the like) alone, and refuses to
//    replace a newer installed guard with an older one, unless --force;
//  - remote.pushDefault -> private, when a remote named `private` exists, so a
//    bare `git push` of a work branch never aims at the public repository;
//  - hygiene.allowedEmail: the current user.email and GitHub noreply
//    addresses, the e-mails new public commits may carry;
//  - checks that `origin` is the public repository;
//  - creates the untracked .hygiene-denylist from .hygiene-denylist.example.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DENYLIST_FILE, NOREPLY_GLOB, PUBLIC_REPO_PATH, buildHostPatterns, isPublicRemote, readHostIdentity, scanLine,
} from './hygiene-patterns.mjs';
import { GUARD_FILES, guardHash, guardVersionOf } from './pre-push.mjs';

export const INSTALL_DIR = 'hygiene-hooks';
export const PRIVATE_REMOTE = 'private';
// What the first version of this script set; replaced without --force.
const LEGACY_HOOKS_PATH = 'scripts/git-hooks';
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** `hashes.sha256` for the two installed scripts, in sha256sum's format. */
export function hashLines(installDir) {
  return `${['pre-push.mjs', 'hygiene-patterns.mjs'].map((name) => `${sha256(path.join(installDir, name))}  ${name}`).join('\n')}\n`;
}

function readGuardSources(sourceDir) {
  const sources = {};
  for (const [key, rel] of Object.entries(GUARD_FILES)) {
    sources[key] = fs.readFileSync(path.join(sourceDir, rel), 'utf8').replace(/\r\n?/g, '\n');
  }
  return sources;
}

function readInstalledVersion(installDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(installDir, 'manifest.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

// More tracked lines than this matching the host or user name means the name
// is probably a common word: the guard would then refuse ordinary text.
export const FLOOD_LINES = 25;
const IDENTITY_LABELS = { 'host-name': 'host name', 'host-username': 'user name' };

/** Warnings for host identity patterns that match many lines of the tracked tree (names never printed). */
export function floodWarnings({ cwd, identity = readHostIdentity() }) {
  let files = [];
  try {
    files = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean);
  } catch {
    return [];
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', windowsHide: true }).trim();
  const warnings = [];
  for (const pattern of buildHostPatterns(identity).filter((p) => IDENTITY_LABELS[p.name])) {
    let lines = 0;
    for (const rel of files) {
      let text = '';
      try {
        const file = path.join(root, rel);
        if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
        text = fs.readFileSync(file, 'utf8');
      } catch { continue; }
      for (const line of text.split('\n')) if (scanLine(line, [pattern]).length) lines += 1;
    }
    if (lines > FLOOD_LINES) {
      warnings.push(`your ${IDENTITY_LABELS[pattern.name]} matches ${lines} lines of the tracked tree; it is probably a common word, `
        + 'so the guard would refuse ordinary text. Push from an account or machine with a distinctive name, or put the '
        + 'specific private names you need guarded in .hygiene-denylist and report the word for the generic list.');
    }
  }
  return warnings;
}

// ---- is the installed guard working? ----------------------------------------

/**
 * Whether this clone, when its origin is the public repository, has a working
 * installed guard. git runs no hook at all when core.hooksPath is unset or
 * points at a missing directory, so this is the check `npm run setup:git --
 * --check`, npm test and npm run hygiene use to say so out loud.
 */
export function checkGuard({ cwd }) {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
      return null;
    }
  };
  const origin = git(['remote', 'get-url', 'origin']);
  if (!origin || !isPublicRemote(origin)) return { applies: false, ok: true, reasons: [] };
  const reasons = [];
  const hooksPath = git(['config', 'core.hooksPath']);
  const toplevel = git(['rev-parse', '--show-toplevel']) || cwd;
  if (!hooksPath) {
    reasons.push('core.hooksPath is not set, so no pre-push hook runs');
  } else if (!path.isAbsolute(hooksPath)) {
    reasons.push(`core.hooksPath is the relative "${hooksPath}" of an older setup`);
  } else {
    const dir = path.resolve(toplevel, hooksPath);
    if (!fs.existsSync(path.join(dir, 'pre-push'))) {
      reasons.push(`the hook directory ${hooksPath} does not exist (deleted or renamed?), so no pre-push hook runs`);
    } else {
      let listed = '';
      try { listed = fs.readFileSync(path.join(dir, 'hashes.sha256'), 'utf8'); } catch { /* missing */ }
      let current = '';
      try { current = hashLines(dir); } catch { /* a script is missing */ }
      if (!listed || listed !== current) reasons.push('the installed guard does not match its manifest (edited or damaged)');
    }
  }
  return { applies: true, ok: reasons.length === 0, reasons };
}

/** One warning line when the guard is not working here, else null. */
export function guardStatusWarning(cwd) {
  const status = checkGuard({ cwd });
  return status.ok
    ? null
    : `WARNING: the pre-push guard is NOT active in this clone (${status.reasons.join('; ')}). Pushes to the public repository are unguarded; run npm run setup:git.`;
}

export function setupGit({ cwd, force = false, sourceDir = SCRIPTS_DIR, identity = readHostIdentity(), log = console.log } = {}) {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
      return null;
    }
  };
  const report = {
    ok: true, hooksPath: null, installed: null, pushDefault: null, allowedEmails: [], originPublic: false, denylist: null, warnings: [],
  };
  const refuse = (message) => { report.ok = false; report.warnings.push(message); };

  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!common) {
    refuse('not inside a git repository; nothing was set up.');
    for (const warning of report.warnings) log(`WARNING:   ${warning}`);
    return report;
  }

  // 1. The guard, installed next to the repository's own data.
  const installDir = path.join(common, INSTALL_DIR);
  const hooksPath = installDir.split(path.sep).join('/');
  const current = git(['config', 'core.hooksPath']);
  const ours = !current || current === hooksPath || current === LEGACY_HOOKS_PATH;
  const sources = readGuardSources(sourceDir);
  const version = guardVersionOf(sources.script);
  const installedVersion = readInstalledVersion(installDir);
  if (!ours && !force) {
    refuse(`core.hooksPath is already "${current}"; left unchanged and the guard is NOT active. `
      + 'Re-run with `npm run setup:git -- --force` to replace it (the hooks there would stop running).');
  } else if (installedVersion !== null && installedVersion > version && !force) {
    refuse(`the installed guard (v${installedVersion}) is newer than this checkout's (v${version}); left unchanged. `
      + 'Run setup:git from an up-to-date checkout, or add --force.');
  } else {
    if (!ours) log(`hooks:     replacing core.hooksPath "${current}" (--force)`);
    fs.mkdirSync(installDir, { recursive: true });
    for (const [key, rel] of Object.entries(GUARD_FILES)) {
      const target = path.join(installDir, path.basename(rel));
      fs.writeFileSync(target, sources[key]);
      if (key === 'wrapper') fs.chmodSync(target, 0o755);
    }
    const manifest = { version, hash: guardHash(sources) };
    fs.writeFileSync(path.join(installDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    // Checked by the installed wrapper before it runs node (tamper evidence).
    fs.writeFileSync(path.join(installDir, 'hashes.sha256'), hashLines(installDir));
    if (current !== hooksPath) git(['config', 'core.hooksPath', hooksPath]);
    report.hooksPath = hooksPath;
    report.installed = manifest;
    log(`hooks:     guard v${version} installed in ${hooksPath} (core.hooksPath); re-run setup:git after guard updates`);
    const hooksDir = path.join(common, 'hooks');
    const shadowed = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir).filter((f) => !f.endsWith('.sample')) : [];
    if (shadowed.length) report.warnings.push(`hooks in .git/hooks no longer run while core.hooksPath is set: ${shadowed.join(', ')}`);
  }

  // 1b. A host identity that is a common word floods the tree with hits.
  for (const warning of floodWarnings({ cwd, identity })) report.warnings.push(warning);

  // 2. A bare `git push` goes to the private repository.
  if (git(['remote', 'get-url', PRIVATE_REMOTE])) {
    git(['config', 'remote.pushDefault', PRIVATE_REMOTE]);
    report.pushDefault = PRIVATE_REMOTE;
    log(`push:      remote.pushDefault = ${PRIVATE_REMOTE}; a bare "git push" goes to the private repository`);
  } else {
    report.warnings.push(
      `no remote named "${PRIVATE_REMOTE}". Add your private work repository with `
      + `\`git remote add ${PRIVATE_REMOTE} <its url>\` and run \`npm run setup:git\` again. `
      + 'remote.pushDefault is left unset until then.',
    );
  }

  // 3. The e-mails new public commits may carry (author and committer).
  const allowed = (git(['config', '--local', '--get-all', 'hygiene.allowedEmail']) || '').split('\n').map((e) => e.trim()).filter(Boolean);
  for (const email of [git(['config', 'user.email']), NOREPLY_GLOB]) {
    if (email && !allowed.some((a) => a.toLowerCase() === email.toLowerCase())) {
      git(['config', '--local', '--add', 'hygiene.allowedEmail', email]);
      allowed.push(email);
    }
  }
  report.allowedEmails = allowed;
  log(`e-mails:   hygiene.allowedEmail holds ${allowed.length} entr${allowed.length === 1 ? 'y' : 'ies'} (git config --get-all hygiene.allowedEmail)`);

  // 4. origin is the public repository.
  const origin = git(['remote', 'get-url', 'origin']);
  report.originPublic = Boolean(origin) && isPublicRemote(origin);
  if (report.originPublic) {
    log(`origin:    the public repository (${PUBLIC_REPO_PATH}); it takes only main and tags`);
  } else {
    report.warnings.push(`"origin" is ${origin ? 'not' : 'missing, expected'} the public repository https://${PUBLIC_REPO_PATH}.`);
  }

  // 5. The local denylist, in the main worktree's root (shared by all worktrees).
  const toplevel = git(['rev-parse', '--show-toplevel']) || cwd;
  const root = path.basename(common) === '.git' ? path.dirname(common) : toplevel;
  const denylist = path.join(root, DENYLIST_FILE);
  const example = [toplevel, root].map((dir) => path.join(dir, `${DENYLIST_FILE}.example`)).find((p) => fs.existsSync(p));
  if (fs.existsSync(denylist)) {
    log(`denylist:  ${DENYLIST_FILE} exists (untracked)`);
  } else if (example) {
    fs.copyFileSync(example, denylist);
    log(`denylist:  created ${DENYLIST_FILE} from the example; add your private names to it`);
  } else {
    report.warnings.push(`no ${DENYLIST_FILE}.example to create ${DENYLIST_FILE} from.`);
  }
  report.denylist = fs.existsSync(denylist) ? denylist : null;

  for (const warning of report.warnings) log(`WARNING:   ${warning}`);
  return report;
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly && process.argv.includes('--check')) {
  const status = checkGuard({ cwd: process.cwd() });
  if (!status.applies) console.log('origin is not the public repository; there is no guard to check here.');
  else if (status.ok) console.log('the pre-push guard is active (installed copy verified).');
  else console.log(guardStatusWarning(process.cwd()));
  process.exitCode = status.ok ? 0 : 1;
} else if (invokedDirectly) {
  const report = setupGit({ cwd: process.cwd(), force: process.argv.includes('--force') });
  process.exitCode = report.ok ? 0 : 1;
}
