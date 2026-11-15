// vitest globalSetup (wired in vitest.config.js, so npm test, npm run hygiene
// and a bare npx vitest run all use it): when this clone's origin is the public
// repository and the installed pre-push guard is missing, damaged or older
// than the checkout's, print a
// framed block to stderr once per run, before the reporter starts. A
// console.warn inside a passing test is not shown by vitest's reporter.
// Never in CI (no guard is installed there by design), never a failure.

import { checkGuard } from '../../scripts/setup-git.mjs';

const RULE = '='.repeat(78);

/** The framed warning, or null when there is nothing to say. */
export function guardBanner({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.CI || env.GITHUB_ACTIONS) return null;
  let status;
  try { status = checkGuard({ cwd }); } catch { return null; }
  if (!status.applies || status.ok) return null;
  return [
    '',
    RULE,
    ' bind-manager: the pre-push guard is NOT ACTIVE or NOT CURRENT in this clone',
    ...status.reasons.map((reason) => ` - ${reason}`),
    ' Pushes to the public repository are unguarded, or guarded by older rules.',
    ' Fix: npm run setup:git      (check: npm run setup:git -- --check)',
    RULE,
    '',
  ].join('\n');
}

export default function setup() {
  const text = guardBanner();
  if (text) process.stderr.write(`${text}\n`);
}
