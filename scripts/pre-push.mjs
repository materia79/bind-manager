#!/usr/bin/env node
// git pre-push hook body (scripts/git-hooks/pre-push execs this), and the scan
// CLI the release procedure uses (docs/RELEASING.md).
//
// Only the PUBLIC repository is guarded; pushes to the private work
// repository or any other remote pass untouched. For the public remote:
//
//  1. Only `refs/heads/main` and `refs/tags/*` may be pushed. Topic branches
//     belong in the private repository: on a public host a deleted branch's
//     commits stay fetchable by hash, so a leak pushed there cannot be taken
//     back. Deleting `main` is refused too.
//  2. Every commit that would be new on the public remote is scanned: its
//     message, every ADDED line of its diff, and every file path it touches
//     (merges: what they add relative to their first parent). Annotated tag
//     messages are scanned as well. A hit prints the commit, `file:line` and
//     the pattern name, never the matched text, and the push is refused.
//     What the remote already has is asked at push time (`git ls-remote`,
//     plus the remote shas on stdin); local tracking refs are not trusted.
//     When the remote cannot be asked, or url.*.insteadOf would make
//     `git ls-remote` ask another repository than the push goes to, the push
//     is refused.
//
// git calls the hook with `<remote name> <remote url>` and feeds one line per
// ref on stdin: `<local ref> <local sha> <remote ref> <remote sha>`.
// Exit codes: 0 clean, 1 refused (a rule or a hit), 2 the scan itself failed
// (git error, invalid denylist regex, time budget overrun). Never 0 on error.
//
// There is no environment variable that skips or weakens this. A deliberate
// false positive is allowed per line with `hygiene-allow: <pattern-name>` in
// the content. `git push --no-verify` must never be used for the public remote.
//
// CLI (no push involved):
//   node scripts/pre-push.mjs --scan-range <a>..<b>   commits in a range
//   node scripts/pre-push.mjs --scan-tree [<rev>]     every file at a commit
//   node scripts/pre-push.mjs --scan-path <path>...   files on disk (dist/, a Pages copy)
//   add --scope everywhere to apply only the patterns CI can apply

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  NOREPLY_GLOB, buildPatterns, emailAllowed, isPublicRemote, loadDenylist, maskPath, maskText, parseRemoteUrl, PUBLIC_REPO_PATH,
  readAllowedEmails, resolveSshHostname, scanLine,
} from './hygiene-patterns.mjs';

const ZERO_SHA_RE = /^0+$/;
const MAX_HITS_SHOWN = 60;
const SKIP_DIRS = new Set(['node_modules', '.git']);

// ---- the installed copy ----------------------------------------------------

// Bump when the guard's behaviour changes. setup:git refuses to replace a
// newer installed guard with an older one (an old checkout) without --force.
export const GUARD_VERSION = 5;
// The guard's source files, relative to scripts/; installed by basename.
export const GUARD_FILES = Object.freeze({ script: 'pre-push.mjs', patterns: 'hygiene-patterns.mjs', wrapper: 'git-hooks/pre-push' });

export function guardVersionOf(scriptText) {
  const m = String(scriptText || '').match(/^export const GUARD_VERSION = (\d+);/m);
  return m ? Number(m[1]) : 0;
}

const toLf = (text) => String(text).replace(/\r\n?/g, '\n');

/** sha256 over the three guard files, LF-normalised. */
export function guardHash(sources) {
  const hash = crypto.createHash('sha256');
  for (const key of Object.keys(GUARD_FILES)) hash.update(`${toLf(sources[key] || '')}\0`);
  return hash.digest('hex');
}

const readLf = (file) => { try { return toLf(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/**
 * One warning line when this is the installed copy (a manifest.json lies next
 * to it) and the checkout's scripts/ holds a different guard; null otherwise.
 * The installed copy always does the scanning, whatever the checkout holds.
 */
export function compareWithCheckout({ installedDir, repoRoot }) {
  const manifest = readLf(path.join(installedDir, 'manifest.json'));
  const checkoutScript = readLf(path.join(repoRoot, 'scripts', GUARD_FILES.script));
  if (!manifest || checkoutScript === null) return null; // not installed, or a commit without the guard
  const same = checkoutScript === readLf(path.join(installedDir, GUARD_FILES.script))
    && readLf(path.join(repoRoot, 'scripts', GUARD_FILES.patterns)) === readLf(path.join(installedDir, GUARD_FILES.patterns));
  if (same) return null;
  let installed = 0;
  try { installed = JSON.parse(manifest).version; } catch { /* unreadable manifest */ }
  const checkout = guardVersionOf(checkoutScript);
  return checkout > installed
    ? `pre-push: the installed guard (v${installed}) is OLDER than this checkout's scripts/ (v${checkout}); scanning with the installed guard. Run npm run setup:git to update it.`
    : `pre-push: the installed guard (v${installed}) differs from this checkout's scripts/ (v${checkout}); scanning with the installed guard. Re-run npm run setup:git only if this checkout's guard is the one you want.`;
}

/**
 * `{ installed, checkout }` when this is the installed copy (a manifest.json
 * lies next to it) and the checkout's scripts/ holds a guard with a HIGHER
 * version than this one; null otherwise (also when the checkout has no guard).
 * A public push is then refused: the newer rules would not run.
 */
export function newerCheckoutGuard({ installedDir, repoRoot, installedVersion = GUARD_VERSION }) {
  if (readLf(path.join(installedDir, 'manifest.json')) === null) return null;
  const checkoutScript = readLf(path.join(repoRoot, 'scripts', GUARD_FILES.script));
  if (checkoutScript === null) return null;
  const checkout = guardVersionOf(checkoutScript);
  return checkout > installedVersion ? { installed: installedVersion, checkout } : null;
}

// ---- git version ---------------------------------------------------------

// --diff-merges=first-parent (what a merge adds) needs git 2.31. Older git is
// refused rather than scanned with a weaker diff.
export const MIN_GIT_VERSION = [2, 31, 0];

export function parseGitVersion(text) {
  const m = String(text || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

export function gitVersionOk(text) {
  const v = parseGitVersion(text);
  if (!v) return false;
  for (let i = 0; i < 3; i += 1) if (v[i] !== MIN_GIT_VERSION[i]) return v[i] > MIN_GIT_VERSION[i];
  return true;
}

// ---- remote and ref rules ------------------------------------------------

// Which remote is public: see isPublicRemote in hygiene-patterns.mjs.
export { isPublicRemote, parseRemoteUrl } from './hygiene-patterns.mjs';

export function parseRefLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha };
  }).filter((ref) => ref.remoteRef && ref.localSha);
}

export function isDeletion(ref) {
  return ZERO_SHA_RE.test(String(ref?.localSha || ''));
}

// Public main is never rewritten: consumers pin public commits by sha. This is
// pending the owner's confirmation; set it to false to allow non-fast-forward
// pushes to public main again (they are scanned either way).
export const REFUSE_PUBLIC_MAIN_REWRITE = true;

/**
 * Messages for refs the public remote must not receive; empty when all are
 * fine. `isAncestor(a, b)` answers whether commit a is an ancestor of b
 * (false when a is not known locally).
 */
export function checkPublicRefs(refs, { isAncestor = () => false, refuseRewrite = REFUSE_PUBLIC_MAIN_REWRITE } = {}) {
  const violations = [];
  for (const ref of refs) {
    const name = String(ref.remoteRef || '');
    if (name.startsWith('refs/tags/')) continue;
    if (name === 'refs/heads/main') {
      if (isDeletion(ref)) {
        violations.push('refs/heads/main: deleting the public main branch is not allowed.');
      } else if (refuseRewrite && !ZERO_SHA_RE.test(String(ref.remoteSha || '')) && !isAncestor(ref.remoteSha, ref.localSha)) {
        violations.push('refs/heads/main: this push would rewrite published history (not a fast-forward of the public main). '
          + 'Fetch it (`git fetch origin`) and build on top of it instead.');
      }
      continue;
    }
    violations.push(
      `${name}: the public repository takes only main and tags. Push work branches to the private `
      + 'remote (`git push private <branch>`); a release is `git push origin <branch>:main`.',
    );
  }
  return violations;
}

// ---- git helpers ---------------------------------------------------------

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryGit(args, cwd) {
  try { return git(args, cwd).trim(); } catch { return null; }
}

function objectType(sha, cwd) {
  return tryGit(['cat-file', '-t', sha], cwd);
}

/** The commits among `names` that this repository has, in one `git cat-file --batch-check`. */
function localCommits(names, cwd) {
  if (!names.length) return [];
  const out = execFileSync('git', ['cat-file', '--batch-check'], {
    cwd, input: names.map((name) => `${name}^{commit}\n`).join(''), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const shas = new Set();
  for (const line of out.split('\n')) {
    const m = line.match(/^([0-9a-f]{40,64}) commit \d+$/);
    if (m) shas.add(m[1]);
  }
  return [...shas];
}

// ---- scanning ------------------------------------------------------------

// A line is binary-ish when its UTF-8 reading holds NUL or another control
// character, or bytes that are not valid UTF-8. Such a line, and the NUL-
// dropped and UTF-16 readings of it, only count inside runs of TEXT_RUN_MIN+
// printable characters (a `strings`-style run), and name patterns shorter than
// BINARY_NAME_MIN characters are not applied there: in random bytes they
// match by chance (a 3-letter host name about once per 3-4 MB of image data).
// The UTF-8 reading of a clean text line is scanned whole, with every pattern.
export const TEXT_RUN_MIN = 8;
export const BINARY_NAME_MIN = 6;
const BINARYISH_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F�]/;
const TEXT_RUN_RE = new RegExp(`[\\x20-\\x7E\\t]{${TEXT_RUN_MIN},}`, 'g');

// What still applies inside a binary listed in ALLOW_BINARIES_FILE: private-key
// blocks and the provider token shapes, high-confidence patterns that random
// bytes do not produce. The list exempts identity, path and denylist patterns.
export const ALLOW_LISTED_PATTERNS = new Set([
  'private-key-block', 'github-token', 'anthropic-key', 'openai-key', 'aws-access-key-id',
  'slack-token', 'npm-token', 'google-api-key', 'stripe-live-key', 'jwt',
]);

function makeCollector(patterns) {
  const hits = [];
  const notes = [];
  const places = new Map();
  const binaryPatterns = patterns.filter((p) => !(p.nameLength && p.nameLength < BINARY_NAME_MIN));
  const listedPatterns = patterns.filter((p) => ALLOW_LISTED_PATTERNS.has(p.name));
  const add = (names, where) => { for (const pattern of names) hits.push({ ...where, pattern }); };
  return {
    hits,
    notes,
    line(text, where, file) { add(scanLine(text, patterns, { file }), where); },
    /** A path as it may be printed: every segment a match touches is masked. */
    place(file) {
      if (!places.has(file)) places.set(file, maskPath(file, patterns));
      return places.get(file);
    },
    /** A touched path, scanned as text; its hit is printed masked. */
    path(file, commit) { add(scanLine(file, patterns), { commit, where: `path ${this.place(file)}` }); },
    /**
     * One raw line of content: whole when it is clean text, else by its text
     * runs (see above). `listed`: a reviewed binary (ALLOW_BINARIES_FILE),
     * where only ALLOW_LISTED_PATTERNS still apply.
     */
    buffer(buf, where, file, listed = false) {
      const utf8 = buf.toString('utf8').replace(/\r$/, '');
      if (!BINARYISH_RE.test(utf8)) {
        add(scanLine(utf8, listed ? listedPatterns : patterns, { file }), where);
        return;
      }
      const names = new Set();
      for (const text of binaryReadings(buf, utf8)) {
        for (const run of text.match(TEXT_RUN_RE) || []) {
          for (const name of scanLine(run, listed ? listedPatterns : binaryPatterns, { file })) names.add(name);
        }
      }
      add(names, where);
    },
  };
}

// ---- reading content: lines, encodings, binary data ----------------------

// Lines are split on LF as raw bytes and capped: a line longer than
// MAX_SEGMENT bytes (binary data, a minified bundle) is handed on in
// overlapping segments, so memory stays flat whatever git or a file sends.
// `partial` marks a segment that the same line continues after.
const MAX_SEGMENT = 1 << 20;
const SEGMENT_OVERLAP = 1024;

export async function* readLines(chunks) {
  let pending = [];
  let size = 0;
  for await (const chunk of chunks) {
    let start = 0;
    for (let nl = chunk.indexOf(10, start); nl !== -1; nl = chunk.indexOf(10, start)) {
      pending.push(chunk.subarray(start, nl));
      yield { buf: Buffer.concat(pending), partial: false };
      pending = [];
      size = 0;
      start = nl + 1;
    }
    if (start < chunk.length) {
      pending.push(chunk.subarray(start));
      size += chunk.length - start;
      while (size > MAX_SEGMENT) {
        const joined = Buffer.concat(pending);
        yield { buf: joined.subarray(0, MAX_SEGMENT), partial: true };
        const rest = joined.subarray(MAX_SEGMENT - SEGMENT_OVERLAP);
        pending = [rest];
        size = rest.length;
      }
    }
  }
  if (pending.length) yield { buf: Buffer.concat(pending), partial: false };
}

/**
 * The readings of a binary-ish line: UTF-8, UTF-8 with its NUL bytes dropped
 * (ASCII inside UTF-16 or binary data), and UTF-16LE at both byte alignments.
 */
export function binaryReadings(buf, utf8 = buf.toString('utf8')) {
  const readings = [utf8];
  if (buf.includes(0)) {
    readings.push(Buffer.from(buf.filter((b) => b !== 0)).toString('utf8'));
    for (const start of [0, 1]) {
      const body = buf.subarray(start, start + ((buf.length - start) & ~1));
      readings.push(body.toString('utf16le'));
    }
  }
  return readings;
}

/** 'utf16le' | 'utf16be' | 'utf8' for the first bytes of a file or blob (BOM, or the NUL pattern). */
export function detectEncoding(head) {
  if (head[0] === 0xff && head[1] === 0xfe) return 'utf16le';
  if (head[0] === 0xfe && head[1] === 0xff) return 'utf16be';
  const pairs = Math.floor(Math.min(head.length, 4096) / 2);
  if (pairs < 2) return 'utf8';
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < pairs; i += 1) {
    if (head[2 * i] === 0) evenZero += 1;
    if (head[2 * i + 1] === 0) oddZero += 1;
  }
  if (oddZero > pairs * 0.4 && evenZero < pairs * 0.05) return 'utf16le';
  if (evenZero > pairs * 0.4 && oddZero < pairs * 0.05) return 'utf16be';
  return 'utf8';
}

/** UTF-16 chunks re-encoded as UTF-8, streamed. */
async function* transcodeUtf16(chunks, encoding) {
  const decoder = new TextDecoder(encoding === 'utf16le' ? 'utf-16le' : 'utf-16be');
  for await (const chunk of chunks) yield Buffer.from(decoder.decode(chunk, { stream: true }), 'utf8');
  yield Buffer.from(decoder.decode(), 'utf8');
}

/** The first bytes of a stream, and the whole stream again. */
async function peek(chunks, bytes = 4096) {
  const it = chunks[Symbol.asyncIterator]();
  const head = [];
  let size = 0;
  let done = false;
  while (size < bytes) {
    const next = await it.next();
    if (next.done) { done = true; break; }
    head.push(next.value);
    size += next.value.length;
  }
  async function* all() {
    yield* head;
    if (!done) for (let next = await it.next(); !next.done; next = await it.next()) yield next.value;
  }
  return { head: Buffer.concat(head), stream: all() };
}

// ---- reviewed binary false positives ----------------------------------------

// A tracked file listing binaries a reviewer has cleared, one
// `<sha256>  <path>` per line (`#` comments). An entry is honoured only for a
// file the scanner classifies as binary (a NUL byte in its first 8000 bytes,
// and not UTF-16 text), only for exactly that content and path; every push or
// scan that includes it says "allowed binary: <path>".
export const ALLOW_BINARIES_FILE = '.hygiene-allow-binaries';

export function parseAllowBinaries(text) {
  const map = new Map();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.trim().match(/^([0-9a-f]{64})\s+(\S.*)$/i);
    if (!m || raw.trim().startsWith('#')) continue;
    if (!map.has(m[2])) map.set(m[2], new Set());
    map.get(m[2]).add(m[1].toLowerCase());
  }
  return map;
}

/** The allow list as of a commit (missing file: empty). */
export function readAllowBinariesAt(rev, cwd) {
  const text = tryGit(['show', `${rev}:${ALLOW_BINARIES_FILE}`], cwd);
  return parseAllowBinaries(text || '');
}

export function mergeAllowBinaries(maps) {
  const merged = new Map();
  for (const map of maps) for (const [file, shas] of map) merged.set(file, new Set([...(merged.get(file) || []), ...shas]));
  return merged;
}

export function isBinaryContent(buf) {
  const head = buf.subarray(0, 8000);
  return head.includes(0) && detectEncoding(head) === 'utf8';
}

function allowedBinary(buf, rel, allow) {
  const shas = allow?.get(rel);
  return Boolean(shas && isBinaryContent(buf) && shas.has(crypto.createHash('sha256').update(buf).digest('hex')));
}

/**
 * A whole file or blob, streamed: its path, then every line, decoded by its
 * encoding (UTF-16 with or without BOM is transcoded), binary data included.
 */
export async function scanContentStream(chunks, rel, { patterns, commit = '', allowBinaries = null, notes = null }) {
  const collector = makeCollector(patterns);
  collector.path(rel, commit);
  let listed = false;
  if (allowBinaries?.has(rel)) {
    const parts = [];
    for await (const chunk of chunks) parts.push(chunk);
    const whole = Buffer.concat(parts);
    if (allowedBinary(whole, rel, allowBinaries)) {
      notes?.push(`allowed binary: ${rel}`);
      listed = true;
    }
    chunks = (async function* again() { yield whole; }());
  }
  const { head, stream } = await peek(chunks);
  const encoding = detectEncoding(head);
  const source = encoding === 'utf8' ? stream : transcodeUtf16(stream, encoding);
  let n = 1;
  for await (const { buf, partial } of readLines(source)) {
    collector.buffer(buf, { commit, where: `${collector.place(rel)}:${n}` }, rel, listed);
    if (!partial) n += 1;
  }
  return collector.hits;
}

/**
 * Raw objects from `git cat-file --batch`, parsed binary-safely: yields
 * `{ sha, type, content }` per requested name, in order.
 */
async function* catFileBatch(names, cwd) {
  const child = spawn('git', ['cat-file', '--batch'], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = new Promise((resolve) => { child.on('close', resolve); child.on('error', () => resolve(-1)); });
  child.stdin.on('error', () => {});
  child.stdin.end(names.map((n) => `${n}\n`).join(''));
  let buf = Buffer.alloc(0);
  let want = null;
  for await (const chunk of child.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (!want) {
        const nl = buf.indexOf(10);
        if (nl === -1) break;
        const header = buf.subarray(0, nl).toString('utf8');
        buf = buf.subarray(nl + 1);
        const m = header.match(/^([0-9a-f]{40,64}) (\S+) (\d+)$/);
        if (!m) throw new Error(`git cat-file: ${/ missing$/.test(header) ? 'an object is missing' : 'unexpected output'}`);
        want = { sha: m[1], type: m[2], size: Number(m[3]) };
      }
      if (buf.length < want.size + 1) break;
      yield { sha: want.sha, type: want.type, content: buf.subarray(0, want.size) };
      buf = buf.subarray(want.size + 1);
      want = null;
    }
  }
  const code = await exited;
  if (code !== 0) throw new Error(`git cat-file failed (exit ${code})`);
}

// An ident line as git writes it: `<role> <name> <<e-mail>> <seconds> <+hhmm>`.
const IDENT_RE = /^(author|committer|tagger) [^<>\n]*<([^<>\n]*)> \d+ [+-]\d{4}$/;
const REQUIRED_IDENTS = { commit: ['author', 'committer'], tag: ['tagger'] };

/**
 * The parts of a raw commit or tag object that get published as text: the
 * message (everything after the header, whatever bytes it holds), the lines
 * of a merged tag embedded in the header (`mergetag`), the e-mail of the
 * author, committer or tagger, and the roles whose ident line is missing,
 * repeated or cannot be fully parsed (`malformed`: such a push is refused).
 */
export function parseObject(content, type = 'commit') {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  const split = text.indexOf('\n\n');
  const head = split === -1 ? text : text.slice(0, split);
  const message = split === -1 ? '' : text.slice(split + 2);
  const emails = {};
  const embedded = [];
  const malformed = [];
  let key = '';
  for (const line of head.split('\n')) {
    if (line.startsWith(' ')) {
      if (key === 'mergetag') embedded.push(line.slice(1));
      continue;
    }
    key = line.slice(0, line.indexOf(' ') === -1 ? line.length : line.indexOf(' '));
    if (key === 'author' || key === 'committer' || key === 'tagger') {
      const m = line.match(IDENT_RE);
      if (m && !(key in emails)) emails[key] = m[2];
      else if (!malformed.includes(key)) malformed.push(key);
    }
    if (key === 'mergetag') embedded.push(line.slice('mergetag '.length));
  }
  for (const role of REQUIRED_IDENTS[type] || []) {
    if (!(role in emails) && !malformed.includes(role)) malformed.push(role);
  }
  return { message, embedded, emails, malformed };
}

function scanObjectText({ sha, type, content }, collector, { where, allowedEmails }) {
  const commit = sha.slice(0, 7);
  const { message, embedded, emails, malformed } = parseObject(content, type);
  for (const line of message.split('\n')) {
    const text = line.replace(/\r$/, '');
    if (text) collector.line(text, { commit, where });
  }
  for (const line of embedded) if (line) collector.line(line, { commit, where: 'merged tag message' });
  if (allowedEmails) {
    for (const role of malformed) collector.hits.push({ commit, where: `${role} ident malformed`, pattern: 'ident' });
    for (const role of ['author', 'committer', 'tagger']) {
      if (role in emails && !emailAllowed(emails[role], allowedEmails)) {
        collector.hits.push({ commit, where: `${role} e-mail not allowed`, pattern: 'email-allowlist' });
      }
    }
  }
}

// The b-side path of a `diff --git a/X b/Y` header. With renames off and
// core.quotePath=false, X === Y except for adds/deletes of odd names, which
// the `+++ b/` line then corrects.
function headerPath(rest) {
  const n = (rest.length - 5) / 2;
  if (Number.isInteger(n) && n > 0 && rest.startsWith('a/') && rest.slice(2, 2 + n) === rest.slice(5 + n)) {
    return rest.slice(5 + n);
  }
  const m = rest.match(/^"?a\/(.+?)"? "?b\/(.+?)"?$/);
  return m ? m[2] : rest;
}

/**
 * Scan the commits of `revArgs`: messages and e-mails from the raw commit
 * objects (no byte in a message can end it early), then the added lines and
 * touched paths from one streamed `git log -p`, whose only record marker is a
 * NUL at the start of a line (diff lines always start with their own prefix).
 * `allowedEmails` null skips the e-mail check.
 */
export async function scanCommits(revArgs, { cwd, patterns, allowedEmails = null, allowBinaries = null, notes = null }) {
  const collector = makeCollector(patterns);
  // The revisions go on stdin: a push can carry thousands of `^<sha>` (one per
  // ref the remote reports), more than a command line holds.
  const revInput = revArgs.map((arg) => `${arg}\n`).join('');
  const shas = execFileSync('git', ['rev-list', '--stdin', '--'], {
    cwd, input: revInput, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  }).split('\n').filter(Boolean);
  for await (const object of catFileBatch(shas, cwd)) {
    scanObjectText(object, collector, { where: 'commit message', allowedEmails });
  }
  if (!shas.length) return { hits: collector.hits, commits: 0 };

  // --text: no attribute (-diff, binary) and no NUL byte can hide content.
  const args = [
    '-c', 'core.quotePath=false', 'log', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--text', '--full-index',
    '-p', '-U0', '--diff-merges=first-parent', '--format=%x00%H', '--stdin', '--',
  ];
  const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(revInput);
  let stderr = '';
  child.stderr.on('data', (chunk) => { if (stderr.length < 4000) stderr += chunk; });
  const exited = new Promise((resolve) => {
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(-1));
  });

  let commit = '';
  let state = 'none'; // header | hunk
  let file = '';
  let newLine = 0;
  let continued = false; // the previous segment was a partial added line
  let listed = false; // a reviewed binary (ALLOW_BINARIES_FILE): only ALLOW_LISTED_PATTERNS apply
  for await (const { buf, partial } of readLines(child.stdout)) {
    if (continued) {
      collector.buffer(buf, { commit, where: `${collector.place(file)}:${newLine - 1}` }, file, listed);
      continued = partial;
      continue;
    }
    if (buf[0] === 0) {
      commit = buf.subarray(1, 8).toString('latin1');
      state = 'none';
      continue;
    }
    if (state === 'hunk' && buf[0] === 0x2b) { // '+': an added line
      collector.buffer(buf.subarray(1), { commit, where: `${collector.place(file)}:${newLine}` }, file, listed);
      newLine += 1;
      continued = partial;
      continue;
    }
    const raw = buf.toString('utf8').replace(/\r$/, '');
    if (raw.startsWith('diff --git ')) {
      file = headerPath(raw.slice('diff --git '.length));
      state = 'header';
      listed = false;
      collector.path(file, commit);
      continue;
    }
    if (state === 'header') {
      const index = allowBinaries?.has(file) && raw.match(/^index [0-9a-f]+\.\.([0-9a-f]{40,64})/);
      if (index && !/^0+$/.test(index[1])) {
        const blob = execFileSync('git', ['cat-file', 'blob', index[1]], { cwd, maxBuffer: 1 << 30, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        if (allowedBinary(blob, file, allowBinaries)) {
          listed = true;
          notes?.push(`allowed binary: ${file}`);
        }
      }
      if (raw.startsWith('+++ ')) {
        const target = raw.slice(4).replace(/\t$/, '');
        if (target.startsWith('b/') && target.slice(2) !== file) {
          file = target.slice(2);
          collector.path(file, commit);
        }
      } else if (raw.startsWith('@@')) {
        const m = raw.match(/^@@+ (?:-\d+(?:,\d+)? )+\+(\d+)/);
        newLine = m ? Number(m[1]) : 0;
        state = 'hunk';
      }
      continue;
    }
    if (state === 'hunk') {
      if (raw.startsWith('@@')) {
        const m = raw.match(/^@@+ (?:-\d+(?:,\d+)? )+\+(\d+)/);
        newLine = m ? Number(m[1]) : newLine;
      } else if (raw.startsWith(' ')) {
        newLine += 1;
      }
      // '-' (removed) and '\' (no newline at end of file) lines are not published content.
    }
  }
  const code = await exited;
  if (code !== 0) {
    throw new Error(`git log failed (exit ${code}): ${stderr.split(/\r?\n/)[0] || 'no output'}`);
  }
  return { hits: collector.hits, commits: shas.length };
}

/** An annotated tag object: its message and its tagger e-mail, like a commit's. */
export async function scanTagObject(sha, { cwd, patterns, allowedEmails = null }) {
  const collector = makeCollector(patterns);
  for await (const object of catFileBatch([sha], cwd)) scanObjectText(object, collector, { where: 'tag message', allowedEmails });
  return collector.hits;
}

/** Scan one file on disk, streamed; binary and UTF-16 content included. */
export async function scanFile(absPath, relPath, { patterns, allowBinaries = null, notes = null }) {
  return scanContentStream(fs.createReadStream(absPath), relPath, { patterns, allowBinaries, notes });
}

/** Every file under the given paths (directories recurse, node_modules and .git skipped). */
export function listFiles(target) {
  const out = [];
  const walk = (p) => {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(p)) if (!SKIP_DIRS.has(entry)) walk(path.join(p, entry));
    } else if (stat.isFile()) {
      out.push(p);
    }
  };
  walk(target);
  return out;
}

export async function scanPaths(targets, { cwd, patterns, allowBinaries = null, notes = null }) {
  const hits = [];
  let files = 0;
  for (const target of targets) {
    const abs = path.resolve(cwd, target);
    for (const file of listFiles(abs)) {
      files += 1;
      const rel = path.relative(cwd, file).split(path.sep).join('/');
      hits.push(...await scanFile(file, rel, { patterns, allowBinaries, notes }));
    }
  }
  return { hits, files };
}

/** Every blob in the tree of `rev` (no checkout needed), streamed. */
export async function scanTree(rev, { cwd, patterns, allowBinaries = null, notes = null }) {
  const hits = [];
  const listing = git(['-c', 'core.quotePath=false', 'ls-tree', '-r', '-z', '--full-tree', rev], cwd);
  let files = 0;
  for (const entry of listing.split('\0').filter(Boolean)) {
    const [meta, rel] = entry.split('\t');
    const [, type, sha] = meta.split(' ');
    if (type !== 'blob') continue;
    files += 1;
    const child = spawn('git', ['cat-file', 'blob', sha], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const exited = new Promise((resolve) => { child.on('close', resolve); child.on('error', () => resolve(-1)); });
    hits.push(...await scanContentStream(child.stdout, rel, { patterns, allowBinaries, notes }));
    const code = await exited;
    if (code !== 0) throw new Error(`git cat-file blob failed (exit ${code})`);
  }
  return { hits, files };
}

// ---- the push --------------------------------------------------------------

// The remote is asked once per push (`git ls-remote`); no answer within this
// time refuses the push.
export const LS_REMOTE_TIMEOUT_MS = 60_000;

/**
 * The object names in `git ls-remote` output: one `<sha>\t<ref>` per line (a
 * peeled tag line `<sha>\t<ref>^{}` and `HEAD` count like any other; a
 * `ref: <target>\t<name>` symref line is skipped). Any other line throws: an
 * answer that cannot be read is not trusted.
 */
export function parseLsRemote(text) {
  if (typeof text !== 'string') throw new Error('git ls-remote gave no answer');
  const shas = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (/^ref: \S+\t\S+$/.test(line)) continue;
    const m = line.match(/^([0-9a-f]{40}|[0-9a-f]{64})\t\S+$/);
    if (!m) throw new Error('git ls-remote returned a line that could not be read');
    shas.add(m[1]);
  }
  return [...shas];
}

/** A remote URL with its credentials (between `//` and `@`) and an scp user other than `git` masked. */
export function maskUrl(url) {
  const value = String(url ?? '');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1***@');
  return value.replace(/^([^@/\\\s:]+)@(?=[^:/\\\s]+:)/, (m, user) => (user === 'git' ? m : '***@'));
}

const GITHUB_HOST_NAMES = new Set(['github.com', 'www.github.com', 'ssh.github.com']);

/**
 * Which repository a remote URL names, as one comparable string. Scheme, user,
 * credentials, port, host case, a trailing dot or `www.`, GitHub's
 * `ssh.github.com`, a resolvable ssh alias, a trailing `.git` or slash and the
 * case of the path do not count. Local paths and file:// URLs: the absolute
 * path (relative to `cwd`; case-insensitive on Windows).
 */
export function remoteIdentity(url, cwd = process.cwd()) {
  const raw = String(url ?? '').trim();
  const r = parseRemoteUrl(raw);
  if (r.kind === 'local') {
    const file = raw.match(/^file:\/\/[^/]*(\/.*)$/i);
    let p = raw;
    if (file) {
      try { p = decodeURIComponent(file[1]); } catch { p = file[1]; }
      p = p.replace(/^\/([a-z]:)/i, '$1');
    }
    p = path.resolve(cwd, p).replace(/\\/g, '/').replace(/\/+$/, '').replace(/(\/\.git|\.git)$/i, '');
    return `local:${process.platform === 'win32' ? p.toLowerCase() : p}`;
  }
  let host = r.host;
  if (r.kind === 'ssh' && !GITHUB_HOST_NAMES.has(host)) host = resolveSshHostname(r.rawHost) || host;
  host = GITHUB_HOST_NAMES.has(host) ? 'github.com' : host.replace(/^www\./, '');
  return `${host}/${r.segments.join('/')}`;
}

/** `git ls-remote --get-url <target>`: the URL `git ls-remote <target>` would contact (fetch rewriting applied). */
export function gitLsRemoteGetUrl(target, cwd) {
  if (!target || String(target).startsWith('-')) throw new Error('no remote to ask');
  return execFileSync('git', ['ls-remote', '--get-url', target], {
    cwd, encoding: 'utf8', windowsHide: true, timeout: LS_REMOTE_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** `git ls-remote <target>`: the remote's current refs, bounded by LS_REMOTE_TIMEOUT_MS. */
export function gitLsRemote(target, cwd) {
  if (!target || String(target).startsWith('-')) throw new Error('no remote to ask');
  return runBounded('git', ['ls-remote', target], { cwd, timeoutMs: LS_REMOTE_TIMEOUT_MS });
}

/**
 * Run a command, resolve with its stdout (exit 0) or reject. At `timeoutMs`,
 * or past `maxBytes` of output, the whole process tree is ended, not only the
 * direct child (git's transport helper, ssh): `taskkill /T /F` on Windows, the
 * process group elsewhere. A timeout rejects with `code: 'ETIMEDOUT'`.
 */
export function runBounded(command, args, { cwd, timeoutMs, maxBytes = 256 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    const windows = process.platform === 'win32';
    const child = spawn(command, args, { cwd, windowsHide: true, detached: !windows, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    let bytes = 0;
    let failure = null;
    const endTree = (error) => {
      if (failure) return;
      failure = error;
      try {
        if (windows) execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' });
        else process.kill(-child.pid, 'SIGKILL');
      } catch { /* already gone */ }
    };
    const timer = setTimeout(() => endTree(Object.assign(new Error(`${command} timed out`), { code: 'ETIMEDOUT' })), timeoutMs);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) endTree(Object.assign(new Error(`${command} gave too much output`), { code: 'ENOBUFS' }));
      else chunks.push(chunk);
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(Object.assign(new Error(`${command} exited with ${code}`), { status: code }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

/**
 * The commits a push would make new on the remote: the pushed tips, minus
 * what the remote already has, which is only (1) the remote shas git passed
 * on stdin and (2) `remoteTips`, the tips `git ls-remote` reported at push
 * time. Local tracking refs (refs/remotes/<remote>/*) are not used: they can
 * be stale (the remote deleted the ref) or hand-made. A negative whose object
 * this repository does not have is dropped, so the scan covers more, never
 * less. A new ref (zero remote sha) and a force push fall out of this.
 */
export function pushRevArgs(refs, { cwd, remoteTips = [] }) {
  const positives = [];
  const known = [...remoteTips];
  const problems = [];
  for (const ref of refs) {
    if (isDeletion(ref)) continue;
    if (!objectType(`${ref.localSha}^{commit}`, cwd)) {
      problems.push(`${ref.remoteRef}: ${ref.localSha.slice(0, 7)} does not point at a commit; it cannot be scanned.`);
      continue;
    }
    positives.push(`${ref.localSha}^{commit}`);
    if (!ZERO_SHA_RE.test(String(ref.remoteSha || ''))) known.push(ref.remoteSha);
  }
  if (!positives.length) return { revArgs: [], problems, unknownTips: 0 };
  const negatives = localCommits(known.filter((sha) => /^[0-9a-f]{40,64}$/.test(String(sha))), cwd).map((sha) => `^${sha}`);
  return { revArgs: [...positives, ...negatives], problems, unknownTips: missingObjects(remoteTips, cwd) };
}

/** How many of `shas` this repository does not have at all, in one `git cat-file --batch-check`. */
function missingObjects(shas, cwd) {
  const valid = [...new Set(shas)].filter((sha) => /^[0-9a-f]{40,64}$/.test(String(sha)));
  if (!valid.length) return 0;
  const out = execFileSync('git', ['cat-file', '--batch-check'], {
    cwd, input: valid.map((sha) => `${sha}\n`).join(''), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return out.split('\n').filter((line) => / missing$/.test(line)).length;
}

export function formatHit(hit) {
  return `  ${hit.commit ? `${hit.commit}  ` : ''}${hit.where}  [${hit.pattern}]`;
}

/**
 * A printer that masks every match before printing. It never throws: when
 * the active patterns cannot mask (a broken pattern set), the line is masked
 * with the everywhere set, and when even that fails it is withheld.
 */
function maskedLog(print, net) {
  return (line) => {
    for (const patterns of [net.patterns, buildPatterns({ scope: 'everywhere' })]) {
      try { print(maskText(line, patterns)); return; } catch { /* try the next set */ }
    }
    print('(a line of output was withheld: it could not be masked)');
  };
}

function reportHits(hits, log) {
  for (const hit of hits.slice(0, MAX_HITS_SHOWN)) log(formatHit(hit));
  if (hits.length > MAX_HITS_SHOWN) log(`  ... and ${hits.length - MAX_HITS_SHOWN} more`);
}

function denylistNote(repoRoot, log) {
  const denylist = loadDenylist(repoRoot);
  if (denylist.errors.length) {
    throw new Error(`.hygiene-denylist line(s) ${denylist.errors.join(', ')} are not valid regular expressions`);
  }
  if (!denylist.found) log('hygiene: no local denylist (.hygiene-denylist) found; scanning without private names.');
  return denylist;
}

/**
 * The hook. Returns the exit code. `publicRepo`, `patterns`, `lsRemote` and
 * `lsRemoteGetUrl` are test seams passed as parameters; the entry point below
 * never sets them, and nothing here reads the environment.
 */
export async function runPrePush({
  remoteName,
  remoteUrl,
  stdin,
  cwd = process.cwd(),
  publicRepo = PUBLIC_REPO_PATH,
  patterns = null,
  refuseRewrite = REFUSE_PUBLIC_MAIN_REWRITE,
  allowedEmails = null,
  gitVersion = null,
  lsRemote = gitLsRemote,
  lsRemoteGetUrl = gitLsRemoteGetUrl,
  log = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  if (!isPublicRemote(remoteUrl, publicRepo)) return 0;
  // Every printed line passes this net: no matched text is ever printed, in a
  // location, a ref name or a git error message.
  const net = { patterns: patterns || buildPatterns({ scope: 'everywhere' }) };
  const print = log;
  log = maskedLog(print, net);
  const version = gitVersion ?? (tryGit(['--version'], cwd) || '');
  if (!gitVersionOk(version)) {
    log(`pre-push: refusing: git ${MIN_GIT_VERSION.slice(0, 2).join('.')} or newer is required for the public remote (found: ${version || 'unknown'}).`);
    return 2;
  }
  const refs = parseRefLines(stdin);

  const isAncestor = (older, newer) => {
    try { git(['merge-base', '--is-ancestor', older, newer], cwd); return true; } catch { return false; }
  };
  const violations = checkPublicRefs(refs, { isAncestor, refuseRewrite });
  if (violations.length) {
    log(`pre-push: refusing to push to the public remote "${remoteName}":`);
    for (const violation of violations) log(`  - ${violation}`);
    return 1;
  }

  try {
    let active = patterns;
    if (!active) active = buildPatterns({ repoRoot: cwd, denylist: denylistNote(cwd, log) });
    net.patterns = active;

    const emails = allowedEmails || readAllowedEmails(cwd);
    if (!emails.length) {
      log('pre-push: refusing: hygiene.allowedEmail is not set for this repository; run npm run setup:git (it allows your user.email and GitHub noreply addresses).');
      return 1;
    }

    // What the remote already has: asked now, once, not taken from local
    // tracking refs. No readable answer, no public push. A push that only
    // deletes publishes nothing and needs no answer.
    let remoteTips = [];
    if (refs.some((ref) => !isDeletion(ref))) {
      const target = remoteUrl || remoteName;
      // git hands the hook the push URL after push rewriting; `git ls-remote`
      // applies fetch rewriting (url.<base>.insteadOf) to it again. Ask only
      // when that still names the repository that receives this push.
      try {
        const asked = lsRemoteGetUrl(target, cwd);
        if (remoteIdentity(asked, cwd) !== remoteIdentity(target, cwd)) {
          log(`pre-push: refusing: could not ask the public remote "${maskUrl(remoteName)}" which commits it already has: fetches from `
            + `${maskUrl(target)} are rewritten by url.*.insteadOf to ${maskUrl(asked)}, another repository than the one this push goes to.`);
          log('  Remove or narrow that url.*.insteadOf rule, or push from a clone without it. Nothing was pushed.');
          return 2;
        }
      } catch {
        log(`pre-push: refusing: could not ask the public remote "${maskUrl(remoteName)}" which commits it already has (git ls-remote --get-url failed). Nothing was pushed.`);
        return 2;
      }
      try {
        remoteTips = parseLsRemote(await lsRemote(target, cwd));
      } catch (error) {
        const how = error?.code === 'ETIMEDOUT' ? `timed out after ${LS_REMOTE_TIMEOUT_MS / 1000} s` : 'failed or gave an answer that could not be read';
        log(`pre-push: refusing: could not ask the public remote "${maskUrl(remoteName)}" which commits it already has (git ls-remote ${how}).`);
        log('  The scan needs that answer to know what is new, so a push to the public remote needs the network. Nothing was pushed.');
        return 2;
      }
    }
    const { revArgs, problems, unknownTips } = pushRevArgs(refs, { cwd, remoteTips });
    // Tips this clone does not have are not negatives, so more is scanned:
    // old public commits may then be refused; fetching first avoids that.
    const fetchHint = unknownTips
      ? `pre-push: the public remote has commits this clone does not have (${unknownTips} of its tips are unknown here); run git fetch ${maskUrl(remoteName)} and push again.`
      : null;
    if (problems.length) {
      log('pre-push: refusing to push to the public remote:');
      for (const problem of problems) log(`  - ${problem}`);
      return 1;
    }
    const hits = [];
    const notes = [];
    let commits = 0;
    // Tag and branch names are published too.
    for (const ref of refs) {
      for (const name of new Set([ref.remoteRef, ref.localRef])) {
        if (!name || name === '(delete)' || ZERO_SHA_RE.test(name)) continue;
        for (const pattern of scanLine(name, active)) hits.push({ commit: '', where: `ref ${name}`, pattern });
      }
    }
    if (revArgs.length) {
      const allowBinaries = mergeAllowBinaries(refs.filter((ref) => !isDeletion(ref)).map((ref) => readAllowBinariesAt(`${ref.localSha}^{commit}`, cwd)));
      const result = await scanCommits(revArgs, { cwd, patterns: active, allowedEmails: emails, allowBinaries, notes });
      hits.push(...result.hits);
      commits = result.commits;
    }
    for (const ref of refs) {
      if (!isDeletion(ref) && objectType(ref.localSha, cwd) === 'tag') {
        hits.push(...await scanTagObject(ref.localSha, { cwd, patterns: active, allowedEmails: emails }));
      }
    }
    for (const note of new Set(notes)) log(`pre-push: ${note}`);
    if (hits.length) {
      if (fetchHint) log(fetchHint);
      log(`pre-push: refusing to push to the public remote "${remoteName}": private or secret-looking text in what would be published:`);
      reportHits(hits, log);
      log('Fix the commits (amend, or rebuild the branch) before publishing. For a deliberate false positive,');
      log('add "hygiene-allow: <pattern-name>" on that line. See docs/RELEASING.md.');
      if (fetchHint) log(fetchHint);
      return 1;
    }
    log(`pre-push: hygiene scan clean (${commits} new commit(s) for the public remote).`);
    return 0;
  } catch (error) {
    log(`pre-push: could not scan the push, refusing: ${String(error?.message || error).split('\n')[0]}`);
    return 2;
  }
}

// ---- CLI -------------------------------------------------------------------

export async function runCli(argv, { cwd = process.cwd(), log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  let scope = 'all';
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scope') { scope = argv[i + 1]; i += 1; } else rest.push(argv[i]);
  }
  const [mode, ...targets] = rest;
  const net = { patterns: buildPatterns({ scope: 'everywhere' }) };
  const print = log;
  log = maskedLog(print, net);
  if (!['all', 'everywhere'].includes(scope)) { log(`unknown scope "${scope}" (all | everywhere)`); return 2; }
  try {
    const denylist = scope === 'all' ? denylistNote(cwd, log) : undefined;
    const patterns = buildPatterns({ scope, repoRoot: cwd, denylist });
    net.patterns = patterns;
    const notes = [];
    let result;
    if (mode === '--scan-range' && targets.length === 1) {
      // The e-mail check is local-only. Without hygiene.allowedEmail the CLI
      // falls back to user.email and GitHub noreply addresses, and says so.
      let allowedEmails = null;
      if (scope === 'all') {
        allowedEmails = readAllowedEmails(cwd);
        if (!allowedEmails.length) {
          allowedEmails = [tryGit(['config', 'user.email'], cwd), NOREPLY_GLOB].filter(Boolean);
          log('hygiene: hygiene.allowedEmail is not set; checking e-mails against user.email and GitHub noreply addresses.');
        }
      }
      const tip = targets[0].includes('..') ? (targets[0].split('..').pop().replace(/^\./, '') || 'HEAD') : targets[0];
      result = await scanCommits([targets[0]], { cwd, patterns, allowedEmails, allowBinaries: readAllowBinariesAt(tip, cwd), notes });
      log(`hygiene: scanned ${result.commits} commit(s) in ${targets[0]} (scope ${scope}).`);
    } else if (mode === '--scan-tree' && targets.length <= 1) {
      const rev = targets[0] || 'HEAD';
      result = await scanTree(rev, { cwd, patterns, allowBinaries: readAllowBinariesAt(rev, cwd), notes });
      log(`hygiene: scanned ${result.files} file(s) in the tree of ${rev} (scope ${scope}).`);
    } else if (mode === '--scan-path' && targets.length >= 1) {
      let listed = '';
      try { listed = fs.readFileSync(path.join(cwd, ALLOW_BINARIES_FILE), 'utf8'); } catch { /* none */ }
      result = await scanPaths(targets, { cwd, patterns, allowBinaries: parseAllowBinaries(listed), notes });
      log(`hygiene: scanned ${result.files} file(s) under ${targets.join(', ')} (scope ${scope}).`);
    } else {
      log('usage: node scripts/pre-push.mjs --scan-range <a>..<b> | --scan-tree [<rev>] | --scan-path <path>... [--scope everywhere]');
      return 2;
    }
    for (const note of new Set(notes)) log(`hygiene: ${note}`);
    if (result.hits.length) {
      log(`hygiene: ${result.hits.length} hit(s):`);
      reportHits(result.hits, log);
      return 1;
    }
    log('hygiene: CLEAN');
    return 0;
  } catch (error) {
    log(`hygiene: scan failed: ${String(error?.message || error).split('\n')[0]}`);
    return 2;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const cwd = tryGit(['rev-parse', '--show-toplevel'], process.cwd()) || process.cwd();
  if (args[0]?.startsWith('--')) {
    process.exitCode = await runCli(args, { cwd });
  } else {
    const [remoteName = '', remoteUrl = ''] = args;
    const stdin = await readStdin();
    const installedDir = path.dirname(fileURLToPath(import.meta.url));
    const newer = newerCheckoutGuard({ installedDir, repoRoot: cwd });
    if (newer && isPublicRemote(remoteUrl)) {
      process.stderr.write(`pre-push: refusing: the installed guard (v${newer.installed}) is older than this checkout's (v${newer.checkout}); run npm run setup:git, then push again.\n`);
      process.exitCode = 2;
    } else {
      const warning = compareWithCheckout({ installedDir, repoRoot: cwd });
      if (warning) process.stderr.write(`${warning}\n`);
      process.exitCode = await runPrePush({ remoteName, remoteUrl, stdin, cwd });
    }
  }
}
