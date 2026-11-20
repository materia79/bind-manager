// What the hygiene guard treats as a leak. One definition, used by the
// pre-push hook (scripts/pre-push.mjs, over the commits about to be published),
// by its scan CLI (release checks), and by tests/hygiene (over the tracked tree
// and the built bundles).
//
// Nothing private lives in this file. Everything machine-specific (host name,
// user name, home directory, the gh account, the local denylist) is read at
// runtime, so no file in the repository has to embed anyone's data to look
// for it.
//
// Every pattern has a `name` (printed on a hit, never the matched text) and a
// `scope`:
//   - 'everywhere': meaningful on any machine, CI included (secrets, private
//     key blocks, home and drive paths);
//   - 'local-only': derived from this machine or checkout (host identity, the
//     gh account, the names in the repository's non-public remotes,
//     .hygiene-denylist). CI cannot know these.
//
// A deliberate false positive is allowed per line, for one named pattern, by a
// marker in the content itself:  `... // hygiene-allow: <pattern-name>`.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Spelled as one URL path so the owner's name only ever appears in the form
// the account pattern allows.
export const PUBLIC_REPO_PATH = 'github.com/materia79/bind-manager';
const [publicHost, publicOwner, publicName] = PUBLIC_REPO_PATH.split('/');
export const PUBLIC_REPO = Object.freeze({ host: publicHost, owner: publicOwner, name: publicName });
export const DENYLIST_FILE = '.hygiene-denylist';

const ALLOW_MARKER_RE = /hygiene-allow:\s*([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)/g;

// Host identities that carry no personal information (CI images, containers,
// documentation fixtures). Deriving a pattern from them is all false positive.
export const GENERIC_IDENTITIES = new Set([
  'admin', 'administrator', 'builder', 'ci', 'codespace', 'debian', 'default', 'dev', 'developer',
  'docker', 'example', 'github', 'guest', 'host', 'jenkins', 'localhost', 'node', 'public', 'root',
  'runner', 'runneradmin', 'server', 'test', 'tester', 'ubuntu', 'user', 'vagrant', 'vscode', 'worker',
  // Common words a machine or account is often named after. As a pattern they
  // would flag ordinary text, and in this code base UI and input words above
  // all; setup:git warns about any other identity that floods the tree.
  'home', 'work', 'office', 'laptop', 'desktop', 'computer', 'notebook', 'tower', 'station', 'workstation',
  'linux', 'windows', 'macbook', 'mac', 'pc', 'box', 'main', 'master', 'local', 'owner', 'super',
  'gamer', 'gaming', 'game', 'games', 'player', 'play', 'input', 'panel', 'modal', 'button', 'label', 'state',
  'event', 'value', 'style', 'theme', 'bind', 'binds', 'manager', 'guard', 'tools', 'tool', 'mouse', 'key',
  'keys', 'pad', 'stick', 'axis', 'hello', 'world', 'demo', 'build', 'code', 'coder', 'data', 'file',
  'files', 'media', 'music', 'video', 'photo', 'cloud', 'light', 'dark', 'black', 'white', 'alpha', 'beta',
  'gamma', 'delta', 'omega', 'sigma', 'shadow', 'ghost', 'dragon', 'tiger', 'phoenix', 'storm', 'star',
  'moon', 'sun', 'lab', 'labs', 'nas', 'router', 'raspberrypi', 'pi', 'temp', 'tmp', 'docs', 'web', 'app',
]);

// User-name segments of a home path that are documentation placeholders, not
// someone's account: C:\Users\you\, /home/user/, /Users/<name>/ (angle
// brackets never match the name class at all), %USERNAME%, $USER.
const PATH_PLACEHOLDER_NAMES = new Set([
  'user', 'users', 'username', 'you', 'your', 'yourname', 'your-name', 'your_name', 'me', 'name',
  'example', 'someone', 'somebody', 'dev', 'public', 'default', 'default user', 'all users',
  'runner', 'runneradmin', 'shared',
]);

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isGenericIdentity(value) {
  return GENERIC_IDENTITIES.has(String(value || '').trim().toLowerCase());
}

function isPathPlaceholder(name) {
  const value = String(name || '').trim().toLowerCase();
  return !value || PATH_PLACEHOLDER_NAMES.has(value) || /^[%$({]/.test(value);
}

// Word-ish boundaries that still see a name inside a path, slug or domain:
// `/name`, `name.local` and `x-name` match, `names` and `rename` do not.
export function wholeWord(value, flags = 'gi') {
  return new RegExp(String.raw`(?<![A-Za-z0-9_])` + escapeRegExp(value) + String.raw`(?![A-Za-z0-9_])`, flags);
}

// Names of 5+ characters also hide in compound names (`acmeClient`,
// `AcmeTools`, `name79@`), so they match as case-insensitive substrings;
// shorter ones, where a substring would hit ordinary words, as whole words.
export const SUBSTRING_MIN = 5;
export function namePattern(value) {
  return value.length >= SUBSTRING_MIN ? new RegExp(escapeRegExp(value), 'gi') : wholeWord(value);
}

// One separator character of a Windows path in text: a backslash (repeated
// when escaped in a JS/JSON string) or a forward slash. Always used as
// `${SEP}+`, a single character class, so matching stays linear; the earlier
// `(?:\\{1,4}|/)+` backtracked exponentially on long backslash runs.
const SEP = String.raw`[\\/]`;
const URL_SEP = String.raw`(?:%2F|%5C)`;
// A drive root as Git Bash / MSYS (`/c/`) and WSL (`/mnt/c/`) spell it, not
// inside a longer path or URL.
const MSYS_DRIVE = String.raw`(?<![A-Za-z0-9_.~-])/(?:mnt/)?[A-Za-z]/`;

function flexiblePath(p) {
  return String(p).split(/[\\/]+/).filter(Boolean).map(escapeRegExp).join(`${SEP}+`);
}

// Shannon entropy in bits per character: random tokens sit near 4+, words and
// identifiers lower.
export function entropy(text) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) || 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// Key names. Password-like keys hold human-chosen secrets, so their values do
// not have to look random. Token-like keys do: in this code base they collide
// with CSS design tokens, gamepad codes and other identifiers.
const PASSWORD_KEY = String.raw`(?:pass(?:word|wd|phrase)?|pwd|secret)`;
const TOKEN_KEY = String.raw`(?:token|api[_-]?key|access[_-]?key|auth[_-]?key|private[_-]?key)`;
const KEY_SUFFIX = String.raw`(?:[_-]?(?:id|key|value))?`;
const PASSWORD_KEY_RE = new RegExp(`^${PASSWORD_KEY}$`, 'i');

// Words that make a value a placeholder when they make up most of it.
const PLACEHOLDER_WORDS = /example|your|placeholder|changeme|change-me|dummy|redacted|sample|fake|todo|secret|password|passwd|token|value|here|test|xxx+|\*+|\.\.\./gi;
// A reference to a value, not a value: templates, variables, CI secrets.
const REFERENCE_RE = /^(?:\$|<|\{\{|%|process\.env|env\.|secrets\.|vars\.)|\$\{/i;

export function isPlaceholderValue(value) {
  const v = String(value || '');
  if (!v || REFERENCE_RE.test(v)) return true;
  const total = v.replace(/[^A-Za-z0-9]/g, '').length;
  const rest = v.replace(PLACEHOLDER_WORDS, '').replace(/[^A-Za-z0-9]/g, '').length;
  return rest * 2 < total;
}

// The value of a token-like key. Tuned for this code base: it only counts
// when it looks like a random credential.
export function looksLikeSecretValue(value) {
  const v = String(value || '');
  if (v.length < 16 || isPlaceholderValue(v)) return false;
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return false; // words or numbers alone
  if (/^#|^--|^var\(|^rgba?\(|^hsla?\(/i.test(v)) return false; // colours, CSS custom properties
  if (/^(?:https?:|\.{0,2}\/)/i.test(v)) return false; // URLs and paths
  if (/^[a-z][a-z0-9]*(?:[-_.:][a-z0-9]+)+$/.test(v)) return false; // kebab/snake/dotted identifiers
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}$/.test(v)) return false; // CONSTANT_NAMES, GP_B0_LIKE codes
  if (/^[0-9a-f]+$/i.test(v) && v.length !== 32 && v.length !== 40 && v.length < 48) return false; // short hex: colours, ids
  return entropy(v) >= 3.2;
}

// The value of a password-like key: anything of 8+ characters that is not a
// placeholder, a code reference or a keyword. No identifier, CONSTANT or hex
// exclusion applies here.
export function looksLikePasswordValue(value) {
  const v = String(value || '');
  if (v.length < 8 || isPlaceholderValue(v)) return false;
  if (/^(?:true|false|null|undefined|none)$/i.test(v)) return false;
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(v)) return false; // member access: input.value
  if (/[(){};,]/.test(v)) return false; // code, not a value
  if (/^GP_[AB]\d+[NP]?(?:_GP_[AB]\d+[NP]?)*$/.test(v)) return false; // this code base's gamepad code constants
  return entropy(v) >= 2;
}

// `Authorization: Basic <base64>` only counts when it decodes to user:password.
function isBasicCredential(b64) {
  const decoded = Buffer.from(b64, 'base64').toString('latin1');
  const colon = decoded.indexOf(':');
  return colon > 0 && colon < decoded.length - 1 && /^[\x20-\x7e]+$/.test(decoded) && !isPlaceholderValue(decoded.slice(colon + 1));
}

const isPrivateOctets = (m) => m[0].split('.').every((o) => Number(o) <= 255);
// "version": "10.1.2.3", version = 10.1.2.3: a four-part version, not an address.
const VERSION_CONTEXT_RE = /\bversion["']?\s*[:=]?\s*["']?$/i;
const inVersionContext = (m) => VERSION_CONTEXT_RE.test(m.input.slice(Math.max(0, m.index - 24), m.index));
// Package manifests and lock files hold versions and hashes, never addresses.
const PACKAGE_FILE_RE = /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|[^/]*\.lock)$/i;
// JS/TS source: `password: someVariable` there is code, not a config line.
const SCRIPT_FILE_RE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/i;

/** Secrets: tagged 'everywhere', built from fixed shapes. */
export const SECRET_PATTERNS = Object.freeze([
  { name: 'private-key-block', scope: 'everywhere', re: /-{5}BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-{5}/g },
  { name: 'github-token', scope: 'everywhere', re: /(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { name: 'anthropic-key', scope: 'everywhere', re: /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,}/g },
  // A digit is required: real keys always carry one, kebab-case CSS class
  // names starting with `sk-` never do.
  { name: 'openai-key', scope: 'everywhere', re: /(?<![A-Za-z0-9_-])sk-(?!ant-)(?:proj-|svcacct-|admin-)?(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{24,}/g },
  { name: 'aws-access-key-id', scope: 'everywhere', re: /(?<![A-Za-z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9])/g },
  // The 40-character secret, only next to its key name or an access key id.
  {
    name: 'aws-secret-access-key',
    scope: 'everywhere',
    re: /(?:secret[A-Za-z0-9_-]{0,20}['"]?\s*[:=]\s*['"]?|(?:AKIA|ASIA)[0-9A-Z]{16}[^A-Za-z0-9/+=]{1,10})([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
    accept: (m) => /[a-z]/.test(m[1]) && /[A-Z]/.test(m[1]) && /[0-9]/.test(m[1]),
  },
  { name: 'google-api-key', scope: 'everywhere', re: /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/g },
  { name: 'stripe-live-key', scope: 'everywhere', re: /(?<![A-Za-z0-9_])(?:sk|rk)_live_[0-9A-Za-z]{20,}/g },
  { name: 'slack-token', scope: 'everywhere', re: /(?<![A-Za-z0-9_-])xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'jwt', scope: 'everywhere', re: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'bearer-token', scope: 'everywhere', re: /Authorization['"]?\s*[:=]\s*['"`]?Bearer\s+(?=[A-Za-z0-9._~+/=-]*[0-9])[A-Za-z0-9._~+/-]{20,}=*/gi },
  { name: 'basic-auth', scope: 'everywhere', re: /Authorization['"]?\s*[:=]\s*['"`]?Basic\s+([A-Za-z0-9+/]{8,}={0,2})/gi, accept: (m) => isBasicCredential(m[1]) },
  { name: 'npm-token', scope: 'everywhere', re: /(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g },
  // scheme://user:password@host, any scheme; placeholders and references excluded.
  {
    name: 'url-credentials',
    scope: 'everywhere',
    re: /(?<![A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]*:\/\/([^\s/:@'"`<>]+):([^\s/@'"`<>]+)@[A-Za-z0-9[]/g,
    accept: (m) => m[2].length >= 3 && !isPlaceholderValue(m[2]) && !isPlaceholderValue(`${m[1]}${m[2]}`),
  },
  {
    name: 'password-assignment',
    scope: 'everywhere',
    // No identifier prefix is consumed: the keyword only has to END the key
    // (`DB_PASSWORD`, `clientSecret`). A consumed lazy prefix made this kind
    // of pattern quadratic on long identifier runs.
    re: new RegExp(String.raw`${PASSWORD_KEY}${KEY_SUFFIX}['"]?[ \t]*(?::=|[:=])[ \t]*(['"\`])([^'"\`\s]{8,})\1`, 'gi'),
    accept: (m) => looksLikePasswordValue(m[2]),
  },
  {
    name: 'generic-secret-assignment',
    scope: 'everywhere',
    re: new RegExp(String.raw`${TOKEN_KEY}${KEY_SUFFIX}['"]?[ \t]*(?::=|[:=])[ \t]*(['"\`])([^'"\`\s]{16,})\1`, 'gi'),
    accept: (m) => looksLikeSecretValue(m[2]),
  },
  // env files, YAML, ini: `DB_PASSWORD=...`, `token: ...`, unquoted, the key
  // at the start of the line and the value running to its end.
  {
    name: 'env-secret-assignment',
    scope: 'everywhere',
    re: new RegExp(
      String.raw`^[ \t]*(?:export[ \t]+|-[ \t]+)?[A-Za-z0-9_.-]*?(${PASSWORD_KEY}|${TOKEN_KEY})${KEY_SUFFIX}[ \t]*[:=][ \t]*([^\s'"\`#]{8,})[ \t]*(?:#.*)?$`,
      'gi',
    ),
    accept: (m) => (PASSWORD_KEY_RE.test(m[1]) ? looksLikePasswordValue(m[2]) : looksLikeSecretValue(m[2])),
    // Config shapes only: in JS/TS a quoted literal is password-assignment's.
    skipFile: (file) => SCRIPT_FILE_RE.test(file),
  },
  // Private IPv4 ranges (10/8, 172.16/12, 192.168/16). Loopback and the
  // documentation ranges are not private and do not match.
  {
    name: 'private-ipv4',
    scope: 'everywhere',
    re: /(?<![0-9A-Za-z.])(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}(?![0-9A-Za-z]|\.\d)/g,
    accept: (m) => isPrivateOctets(m) && !inVersionContext(m),
    skipFile: (file) => PACKAGE_FILE_RE.test(file),
  },
]);

/** Home and drive paths: tagged 'everywhere'. */
export const PATH_PATTERNS = Object.freeze([
  {
    name: 'windows-user-path',
    scope: 'everywhere',
    re: new RegExp(
      // C:\Users\<name> (any slashes and escapes), URL-encoded, and the Git Bash /
      // MSYS (/c/Users/<name>) and WSL (/mnt/c/Users/<name>) spellings.
      String.raw`(?:(?<![A-Za-z0-9])[A-Za-z]:${SEP}+Users${SEP}+|[A-Za-z]%3A${URL_SEP}+Users${URL_SEP}+|${MSYS_DRIVE}Users/)([^\\/\s"'\`<>:*?|,;%]+)`,
      'gi',
    ),
    accept: (m) => !isPathPlaceholder(m[1]),
  },
  {
    name: 'worktree-root-path',
    scope: 'everywhere',
    re: new RegExp(String.raw`(?:(?<![A-Za-z0-9])[A-Za-z]:${SEP}+|${MSYS_DRIVE})(?:wt|git|repos|worktrees)(?:${SEP}|['"\`\s]|$)`, 'gi'),
  },
  {
    name: 'posix-home-path',
    scope: 'everywhere',
    re: /(?<![A-Za-z0-9_.~-])(?<![A-Za-z]:)\/(?:home|Users)\/([A-Za-z0-9._-]+)/g,
    accept: (m) => !isPathPlaceholder(m[1]),
  },
  // [/] rather than an escaped slash, so this line's own text never reads as the path.
  { name: 'posix-root-home', scope: 'everywhere', re: /(?<![A-Za-z0-9_.~-])[/]root[/]/g },
]);

// UNC host names that are documentation placeholders (\\server\share).
const UNC_PLACEHOLDER_HOSTS = new Set(['server', 'servername', 'host', 'hostname', 'computer', 'computername', 'machine', 'example', 'nas', 'fileserver']);

/**
 * A UNC path: `\\host\share` as plain text, or `\\\\host\\share` escaped in a
 * JS/JSON string. The separator count has to match the leading one: in code,
 * `\\name\\more` is an escaped single backslash inside a path, not UNC.
 */
export const UNC_PATTERN = Object.freeze({
  name: 'unc-path',
  scope: 'everywhere',
  re: /(?<![\\A-Za-z0-9])(?:\\\\([A-Za-z0-9][A-Za-z0-9._-]+)\\(?!\\)|\\\\\\\\([A-Za-z0-9][A-Za-z0-9._-]+)\\\\(?!\\))[A-Za-z0-9$]/g,
  accept: (m) => {
    const host = m[1] || m[2];
    return /[A-Za-z]/.test(host) && !UNC_PLACEHOLDER_HOSTS.has(host.toLowerCase());
  },
});

// Webmail domains: an address there is private, the domain is not.
const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com',
  'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.de', 'gmx.net', 'gmx.com',
  'web.de', 'mail.com', 'yandex.com', 'yandex.ru', 'zoho.com', 'fastmail.com', 'tutanota.com', 'posteo.de',
]);
const isNoreply = (address) => /(?:^|[.+-])no-?reply(?:[.+-]|@)|@users\.noreply\.github\.com$/i.test(address);

/** The git user.email of this checkout, or ''. */
export function readGitEmail(repoRoot) {
  try {
    return execFileSync('git', ['config', 'user.email'], {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * The git user.email, and every address at its domain when that domain is
 * private (not a webmail provider). Noreply addresses are allowed.
 * `local-only`: CI has no meaningful user.email.
 */
export function buildEmailPatterns(email) {
  const address = String(email || '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1 || isNoreply(address)) return [];
  const domain = address.slice(at + 1);
  const local = escapeRegExp(address.slice(0, at));
  const source = PUBLIC_MAIL_DOMAINS.has(domain)
    ? String.raw`(?<![A-Za-z0-9._%+-])${local}@${escapeRegExp(domain)}(?![A-Za-z0-9-])`
    : String.raw`(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@${escapeRegExp(domain)}(?![A-Za-z0-9-])`;
  return [{ name: 'git-email', scope: 'local-only', re: new RegExp(source, 'gi'), accept: (m) => !isNoreply(m[0]) }];
}

// ---- remotes: which one is public, which names are private --------------

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com', 'ssh.github.com']);
// Public forges: their host name reveals nothing. Any other host in a remote
// URL is somebody's own server and is treated as private.
const PUBLIC_FORGES = new Set([...GITHUB_HOSTS, 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'gitea.com', 'sr.ht', 'git.sr.ht']);

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/**
 * `{ kind: 'url' | 'ssh' | 'local', host, segments }` for any remote URL form:
 * scheme URLs (https, ssh, git, file, ...) with credentials, port, trailing
 * dot on the host, percent-encoding, doubled slashes, `?query`, `#fragment`;
 * scp-like `user@host:path`; local paths. Segments are lower case, without a
 * trailing `.git`.
 */
export function parseRemoteUrl(url) {
  let value = safeDecode(String(url || '').trim());
  let kind = 'local';
  let host = '';
  let rest = value;
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i);
  const scp = !scheme && value.match(/^(?:[^@/\\\s]+@)?([^:/\\\s]+):(?!\/\/)(.*)$/);
  if (scheme && scheme[1].toLowerCase() !== 'file') {
    kind = /ssh/i.test(scheme[1]) ? 'ssh' : 'url';
    const authorityEnd = scheme[2].search(/[/?#]/);
    const authority = authorityEnd === -1 ? scheme[2] : scheme[2].slice(0, authorityEnd);
    rest = authorityEnd === -1 ? '' : scheme[2].slice(authorityEnd);
    host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '');
  } else if (scheme) {
    rest = scheme[2].replace(/^[^/]*/, ''); // file://host/path -> /path
  } else if (scp && scp[1].length > 1) {
    kind = 'ssh';
    host = scp[1];
    rest = scp[2];
  }
  rest = rest.replace(/[?#].*$/, '');
  const rawHost = host;
  host = host.toLowerCase().replace(/\.+$/, '');
  const segments = rest.replace(/\\/g, '/').split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (segments.length) segments[segments.length - 1] = segments[segments.length - 1].replace(/\.git$/, '');
  return { kind, host, rawHost, segments };
}

const sshHostCache = new Map();
/** The HostName ssh would connect to for an alias, or null (`ssh -G`, 3 s timeout). */
export function resolveSshHostname(alias) {
  const host = String(alias || '');
  // A host starting with "-" would be read as an ssh option (-F<file>,
  // -oProxyCommand=...): it is never handed to ssh, and counts as unresolvable.
  if (!host || host.startsWith('-')) return null;
  if (sshHostCache.has(host)) return sshHostCache.get(host);
  let resolved = null;
  try {
    const out = execFileSync('ssh', ['-G', '--', host], {
      encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/^hostname\s+(\S+)/m);
    if (m) resolved = m[1].toLowerCase().replace(/\.+$/, '');
  } catch { /* no ssh, or it failed */ }
  sshHostCache.set(host, resolved);
  return resolved;
}

/**
 * Whether `url` is the public repository (`publicRepo` is `host/owner/repo`).
 *  - URL forms: the host must be GitHub and the path exactly owner/repo;
 *  - ssh and scp-like forms: the host alias is resolved with `ssh -G`; when it
 *    resolves to GitHub the path must be exactly owner/repo; when it cannot be
 *    resolved (no ssh, or an alias that resolves to itself with no dot) a path
 *    ending in owner/repo counts as public: fail closed;
 *  - local paths and file:// URLs ending in owner/repo count as public too
 *    (a mirror of the public repository is guarded like it).
 */
export function isPublicRemote(url, publicRepo = PUBLIC_REPO_PATH, { resolveSshHost = resolveSshHostname } = {}) {
  const [, owner, name] = String(publicRepo).toLowerCase().split('/');
  const r = parseRemoteUrl(url);
  const n = r.segments.length;
  if (n < 2 || r.segments[n - 2] !== owner || r.segments[n - 1] !== name) return false;
  if (r.kind === 'local') return true;
  if (r.kind === 'url') return GITHUB_HOSTS.has(r.host) && n === 2;
  if (GITHUB_HOSTS.has(r.host)) return n === 2;
  // The alias as written (not lower-cased), and never one that looks like an
  // option: that counts as unresolvable, so the path decides (fail closed).
  const resolved = r.rawHost.startsWith('-') ? null : resolveSshHost(r.rawHost);
  if (resolved && GITHUB_HOSTS.has(resolved)) return n === 2;
  if (!resolved || (resolved === r.host && !r.host.includes('.'))) return true;
  return false;
}

/** Every remote URL configured in the repository (fetch and push URLs). */
export function readRemoteUrls(repoRoot) {
  try {
    const out = execFileSync('git', ['config', '--get-regexp', String.raw`^remote\..*\.(url|pushurl)$`], {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).filter(Boolean).map((line) => line.slice(line.indexOf(' ') + 1));
  } catch {
    return [];
  }
}

/**
 * Names that every non-public hosted remote reveals: `owner/repo`, the repo
 * name itself when it is distinctive (has a separator or a digit, or 10+
 * characters, and is not the public repo's name), and the host when it is
 * not a public forge. All `local-only`: they are read from this repository's
 * remotes, so no tracked file has to spell them.
 */
export function buildRemotePatterns(urls, publicRepo = PUBLIC_REPO_PATH) {
  const [, , publicName] = String(publicRepo).toLowerCase().split('/');
  const sources = new Set();
  for (const url of urls) {
    if (isPublicRemote(url, publicRepo)) continue;
    const r = parseRemoteUrl(url);
    if (r.kind === 'local' || r.segments.length < 2) continue;
    const owner = r.segments[r.segments.length - 2];
    const repo = r.segments[r.segments.length - 1];
    sources.add(String.raw`(?<![A-Za-z0-9_.-])${escapeRegExp(owner)}/${escapeRegExp(repo)}(?![A-Za-z0-9_-])`);
    if (repo !== publicName && !isGenericIdentity(repo) && (/[-_.0-9]/.test(repo) || repo.length >= 10)) {
      sources.add(String.raw`(?<![A-Za-z0-9])${escapeRegExp(repo)}(?![A-Za-z0-9])`);
    }
    if (r.host && !PUBLIC_FORGES.has(r.host) && r.host.length >= 4) {
      sources.add(String.raw`(?<![A-Za-z0-9.-])${escapeRegExp(r.host)}(?![A-Za-z0-9-])`);
    }
  }
  return [...sources].map((source) => ({ name: 'private-remote', scope: 'local-only', re: new RegExp(source, 'gi') }));
}

// ---- runtime identity ---------------------------------------------------

export function readHostIdentity() {
  let username = '';
  try { username = String(os.userInfo().username || '').trim(); } catch { /* no passwd entry */ }
  return {
    hostname: String(os.hostname() || '').trim(),
    username,
    homedir: String(os.homedir() || '').trim(),
  };
}

let cachedAccount;
/**
 * The GitHub account the local `gh` is signed in to, or ''. Local config only
 * (no network), with a timeout; a missing or logged-out gh is not an error.
 */
export function readGitHubAccount() {
  if (cachedAccount !== undefined) return cachedAccount;
  let login = '';
  try {
    login = execFileSync('gh', ['config', 'get', '-h', 'github.com', 'user'], {
      encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* gh missing, not logged in, or slow */ }
  if (!/^[A-Za-z0-9-]{2,39}$/.test(login)) login = '';
  cachedAccount = login;
  return login;
}

export function buildHostPatterns(identity = readHostIdentity()) {
  const patterns = [];
  const hostname = String(identity.hostname || '').trim();
  if (hostname.length >= 3 && !isGenericIdentity(hostname)) {
    patterns.push({ name: 'host-name', scope: 'local-only', re: namePattern(hostname), nameLength: hostname.length });
  }
  const username = String(identity.username || '').trim();
  if (username.length >= 4 && !isGenericIdentity(username)) {
    patterns.push({ name: 'host-username', scope: 'local-only', re: namePattern(username), nameLength: username.length });
  }
  const homedir = String(identity.homedir || '').trim();
  const leaf = homedir.split(/[\\/]+/).filter(Boolean).pop() || '';
  if (homedir.length >= 8 && !isGenericIdentity(leaf)) {
    patterns.push({ name: 'host-homedir', scope: 'local-only', re: new RegExp(flexiblePath(homedir), 'gi') });
  }
  return patterns;
}

/**
 * The gh account. When it is also the public repository's owner, the public
 * repository's own URLs (`github.com/<owner>/bind-manager`, `.git`, sub-paths)
 * and its Pages site (`<owner>.github.io`) are legitimate; every other use of
 * the account name (another repository, the private one) is flagged.
 */
export function buildAccountPatterns(account = readGitHubAccount(), repo = PUBLIC_REPO) {
  const login = String(account || '').trim();
  if (login.length < 3 || isGenericIdentity(login)) return [];
  const isOwner = login.toLowerCase() === repo.owner.toLowerCase();
  const allowed = isOwner
    ? String.raw`(?!/${escapeRegExp(repo.name)}(?![A-Za-z0-9_-]))(?!\.github\.io(?![A-Za-z0-9_-]))`
    : '';
  return [{
    name: 'github-account',
    nameLength: login.length,
    scope: 'local-only',
    re: new RegExp(String.raw`(?<![A-Za-z0-9_-])${escapeRegExp(login)}(?![A-Za-z0-9_-])${allowed}`, 'gi'),
  }];
}

// ---- author and committer e-mails --------------------------------------

export const NOREPLY_GLOB = '*@users.noreply.github.com';

/** `hygiene.allowedEmail` values (exact addresses or `*@domain`), from git config. */
export function readAllowedEmails(cwd) {
  try {
    return execFileSync('git', ['config', '--get-all', 'hygiene.allowedEmail'], {
      cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function emailAllowed(email, allowed) {
  const e = String(email || '').trim().toLowerCase();
  return allowed.some((entry) => {
    const a = entry.toLowerCase();
    return a.startsWith('*@') ? e.endsWith(a.slice(1)) && e.indexOf('@') === e.length - a.length + 1 : e === a;
  });
}

// ---- local denylist ------------------------------------------------------

/**
 * Where `.hygiene-denylist` is looked for: the checkout's root, then the main
 * worktree's root (so one file serves every worktree of a clone).
 */
export function denylistCandidates(repoRoot) {
  const candidates = [path.join(repoRoot, DENYLIST_FILE)];
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (path.basename(common) === '.git') candidates.push(path.join(path.dirname(common), DENYLIST_FILE));
  } catch { /* not a git checkout */ }
  return [...new Set(candidates.map((p) => path.resolve(p)))];
}

/**
 * Parse denylist text: one entry per line, `#` starts a comment line, plain
 * strings match case-insensitively (5+ characters as substrings, shorter ones
 * as whole words), `/regex/flags` as given.
 * Returns `{ entries: [{ line, re }], errors: [line numbers] }`.
 */
export function parseDenylist(text) {
  const entries = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const regex = line.match(/^\/(.+)\/([a-z]*)$/);
    try {
      const re = regex
        ? new RegExp(regex[1], [...new Set(`${regex[2].replace(/[gy]/g, '')}g`)].join(''))
        : namePattern(line);
      entries.push({ line: idx + 1, re, ...(regex ? {} : { nameLength: line.length }) });
    } catch {
      errors.push(idx + 1);
    }
  });
  return { entries, errors };
}

/** `{ path, found, entries, errors }` for the first denylist that exists. */
export function loadDenylist(repoRoot) {
  for (const candidate of denylistCandidates(repoRoot)) {
    let text;
    try { text = fs.readFileSync(candidate, 'utf8'); } catch { continue; }
    return { path: candidate, found: true, ...parseDenylist(text) };
  }
  return { path: path.join(repoRoot, DENYLIST_FILE), found: false, entries: [], errors: [] };
}

export function buildDenylistPatterns(denylist) {
  return (denylist?.entries || []).map(({ line, re, nameLength }) => ({
    ...(nameLength ? { nameLength } : {}),
    name: `denylist-line-${line}`,
    scope: 'local-only',
    re,
  }));
}

// ---- assembly and matching ----------------------------------------------

/**
 * Every pattern for this machine and checkout. `scope: 'everywhere'` keeps
 * only the patterns CI can apply. Each machine-specific input is a parameter
 * so tests can use synthetic identities.
 */
export function buildPatterns({
  scope = 'all',
  repoRoot = process.cwd(),
  identity,
  account,
  denylist,
  remotes,
  email,
  repo = PUBLIC_REPO,
  publicRepo = PUBLIC_REPO_PATH,
} = {}) {
  const patterns = [...SECRET_PATTERNS, ...PATH_PATTERNS, UNC_PATTERN];
  if (scope === 'everywhere') return patterns;
  return [
    ...patterns,
    ...buildHostPatterns(identity === undefined ? readHostIdentity() : identity),
    ...buildAccountPatterns(account === undefined ? readGitHubAccount() : account, repo),
    ...buildDenylistPatterns(denylist === undefined ? loadDenylist(repoRoot) : denylist),
    ...buildRemotePatterns(remotes === undefined ? readRemoteUrls(repoRoot) : remotes, publicRepo),
    ...buildEmailPatterns(email === undefined ? readGitEmail(repoRoot) : email),
  ];
}

/** Names allowed on this line by `hygiene-allow: <name>[, <name>]` markers. */
export function allowedOnLine(line) {
  const names = new Set();
  for (const m of String(line).matchAll(ALLOW_MARKER_RE)) {
    for (const name of m[1].split(/\s*,\s*/)) names.add(name);
  }
  return names;
}

function patternMatches(pattern, line) {
  pattern.re.lastIndex = 0;
  for (const m of line.matchAll(pattern.re)) {
    if (!pattern.accept || pattern.accept(m)) return true;
  }
  return false;
}

// Long lines (minified bundles, binary content) are scanned in overlapping
// windows, so no single regex run sees more than WINDOW characters. Anything
// up to OVERLAP characters long is seen whole by at least one window.
export const WINDOW = 8192;
export const OVERLAP = 512;
// Checked after every window. A regex cannot be interrupted, but an overrun
// is never skipped: it throws, and the caller refuses.
export const LINE_BUDGET_MS = 2000;

export class ScanBudgetError extends Error {}

export function* windowsOf(text) {
  if (text.length <= WINDOW) { yield text; return; }
  for (let start = 0; start < text.length; start += WINDOW - OVERLAP) {
    yield text.slice(start, start + WINDOW);
    if (start + WINDOW >= text.length) return;
  }
}

/**
 * Names of the patterns that match this line (minus those allowed on it).
 * `file`, when known, drops the patterns that do not apply to that file
 * (`skipFile`).
 */
export function scanLine(line, patterns, { budgetMs = LINE_BUDGET_MS, file = '' } = {}) {
  const text = String(line ?? '');
  if (!text) return [];
  const allowed = text.includes('hygiene-allow:') ? allowedOnLine(text) : null;
  const active = file ? patterns.filter((p) => !p.skipFile?.(file)) : patterns;
  const hits = new Set();
  const started = performance.now();
  // JSON may escape every forward slash (`C:\/Users\/<name>`): read it unescaped too.
  const texts = text.includes('\\/') ? [text, text.replace(/\\\//g, '/')] : [text];
  for (const window of texts.flatMap((t) => [...windowsOf(t)])) {
    for (const pattern of active) {
      if (hits.has(pattern.name) || allowed?.has(pattern.name)) continue;
      if (patternMatches(pattern, window)) hits.add(pattern.name);
    }
    if (performance.now() - started > budgetMs) {
      throw new ScanBudgetError(`a line of ${text.length} characters overran the ${budgetMs} ms scan time budget`);
    }
  }
  return [...hits];
}

/** `[start, end)` spans of every accepted match of the given patterns. */
export function matchSpans(text, patterns) {
  const value = String(text ?? '');
  const spans = [];
  let offset = 0;
  for (const window of windowsOf(value)) {
    for (const pattern of patterns) {
      for (const m of window.matchAll(pattern.re)) {
        if (!pattern.accept || pattern.accept(m)) spans.push([offset + m.index, offset + m.index + Math.max(m[0].length, 1)]);
      }
    }
    offset += WINDOW - OVERLAP;
  }
  return spans;
}

/** The text with every match replaced by `[...]`: what the guard prints instead of a match. */
export function maskText(text, patterns) {
  const value = String(text ?? '');
  const spans = matchSpans(value, patterns).sort((a, b) => a[0] - b[0]);
  if (!spans.length) return value;
  let out = '';
  let at = 0;
  for (const [start, end] of spans) {
    if (end <= at) continue;
    out += `${value.slice(at, Math.max(at, start))}[...]`;
    at = Math.max(at, end);
  }
  return out + value.slice(at);
}

/** A path with every segment that a match touches replaced by `[...]`. */
export function maskPath(p, patterns) {
  const value = String(p ?? '');
  const spans = matchSpans(value, patterns);
  if (!spans.length) return value;
  let pos = 0;
  return value.split('/').map((segment) => {
    const start = pos;
    const end = pos + segment.length;
    pos = end + 1;
    return spans.some(([s, e]) => s < end + 1 && e > start) ? '[...]' : segment;
  }).join('/');
}
