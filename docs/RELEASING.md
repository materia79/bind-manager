# Releasing: the hygiene gate

Every public step of bind-manager passes through one gate. Nothing private (secrets, machine paths, account or private project names) may reach the public side, because what is published there cannot be taken back: a public commit stays fetchable by its hash even after a force push or a branch deletion.

## Public steps

Each of these is a public step and needs the gate, every time:

1. a push to `origin` (the public repository; it takes only `main` and tags);
2. a tag;
3. the `main-latest` rolling release (published by CI on every push to public `main`);
4. `npm publish`, should the package ever be published;
5. the GitHub Pages copy of the demo in the owner's site repository (`materia79.github.io/projects/bind-manager`).

## The gate

Before each public step, all four:

1. **The installed guard is current.** Re-run `npm run setup:git` in every clone before the first public push of this release; `npm run setup:git -- --check` must report the guard as current (it exits 1 for an installed guard older than the checkout's).
2. **`npm run hygiene` is green on the exact commit** being published, after `npm run build` so the bundles are scanned too.
3. **A fresh checker reports CLEAN.** A session (or person) that did not build the change runs the scans below over the tree, the commit messages and added lines since the last public `main` or tag, `dist/`, the `npm pack --dry-run` list and the Pages files about to be copied, and reports `CLEAN` or the hits (commit, `file:line`, pattern name; never the matched text).
4. **The owner approves** that step explicitly.

`git push --no-verify` skips the pre-push hook and must never be used for the public remote.

## The scans

All of them run the same patterns as the pre-push hook (`scripts/hygiene-patterns.mjs`) and push nothing. Exit code 0 means CLEAN, 1 means hits, 2 a usage or scan error.

```bash
npm run build
npm run hygiene                                              # tree, npm pack list, dist bundles, guard tests

git fetch origin
node scripts/pre-push.mjs --scan-tree HEAD                   # every file at the commit
node scripts/pre-push.mjs --scan-range origin/main..HEAD     # messages, e-mails, added lines and paths of new commits
node scripts/pre-push.mjs --scan-range <last-tag>..HEAD      # when releasing against a tag
node scripts/pre-push.mjs --scan-path dist                   # the built bundles
npm pack --dry-run --json                                    # the list npm would publish (also scanned by npm run hygiene)
node scripts/pre-push.mjs --scan-path <pages-copy-dir>       # the files about to be copied to the Pages repository
```

Add `--scope everywhere` to any scan to apply only the patterns CI applies. Without it, the local patterns run as well: this machine's host name, user name and home directory, the GitHub account `gh` is signed in to, the names in this repository's non-public remotes, the git `user.email` (and its domain when that is not a webmail provider), and the entries of `.hygiene-denylist`. `--scan-range` also checks the author and committer e-mails against `hygiene.allowedEmail`.

## Releasing to public main

```bash
npm run setup:git                       # once per clone, and again after every guard update
git push private <branch>               # work branches live in the private repository
# ... the gate above, on the commit to publish ...
git push origin <branch>:main           # the hook scans exactly what would become public
git push origin <tag>                   # tags likewise
```

## What the hook enforces

`npm run setup:git` copies the guard (`scripts/git-hooks/pre-push`, `scripts/pre-push.mjs`, `scripts/hygiene-patterns.mjs`) into the clone's shared git directory, `.git/hygiene-hooks/`, and points `core.hooksPath` at that absolute path. The hook therefore runs for every worktree of the clone, whatever commit is checked out (an old tag, a bisect state, a lane at an older commit), and an edited or missing `scripts/` in a checkout cannot replace it. When the checkout's `scripts/` differ from the installed copy, the hook prints one warning line and scans with the installed copy anyway, also when the installed copy is the older one; re-run `npm run setup:git` from an up-to-date checkout to update it. `setup:git` refuses to replace a newer installed guard with an older one, and another `core.hooksPath` (husky and the like), unless given `-- --force`.

The installed copy is verified by hash: `setup:git` writes `hashes.sha256` for the installed `pre-push.mjs` and `hygiene-patterns.mjs`, and the installed wrapper checks both (`sha256sum`, or `shasum -a 256`) before it runs node. An edited or damaged copy, a missing hash file or a machine without either tool refuses every push with "run npm run setup:git". This is tamper evidence, not tamper proofing: whoever can edit the wrapper itself can bypass it.

`npm run setup:git -- --check` exits non-zero, and `npm test` and `npm run hygiene` print a warning, when this clone's `origin` is the public repository but no working installed guard is there (`core.hooksPath` unset, pointing at a missing directory, or a hash mismatch), or the installed guard is older than the checkout's (its `manifest.json` version is lower than `GUARD_VERSION` in the checkout's `scripts/pre-push.mjs`, or missing). The installed hook itself refuses a push to the public remote while the checkout carries a newer guard version ("the installed guard (vN) is older than this checkout's (vM); run npm run setup:git, then push again"); pushes to other remotes, and a checkout without `scripts/`, are not affected.

The public remote is recognised in these URL forms (all tested): `https://`, `git://` and `ssh://` URLs of `github.com`, `www.github.com` or `ssh.github.com` (port 443 included), with or without credentials, port, `.git`, a trailing slash or a trailing dot on the host, percent-encoding, doubled slashes, `?query` or `#fragment`, in any letter case; and the scp-like `git@github.com:<owner>/<repo>.git`. An SSH host alias (`git@github-work:...`) is resolved with `ssh -G`; when it cannot be resolved, a path ending in the public `<owner>/<repo>` counts as public (fail closed). A host that starts with `-` is never handed to ssh and counts as unresolvable. A local path or `file://` URL ending in the public `<owner>/<repo>` counts as public too. The private repository and every other remote pass untouched.

For the public remote:

- tag and branch names are scanned like content (a tag name carrying a token is refused, printed masked);
- only `refs/heads/main` and `refs/tags/*` are accepted; other branches, and deleting `main`, are refused. Old public branches (`dev`, `review-fixes`, ...) get no further pushes; retiring one is done in the GitHub web interface;
- a push to `main` that is not a fast-forward of the public `main` is refused (`REFUSE_PUBLIC_MAIN_REWRITE` in `scripts/pre-push.mjs`, pending the owner's confirmation);
- what is new is decided by asking the remote: at push time the hook runs `git ls-remote` once and treats only the tips it reports, plus the remote shas git passes for the pushed refs, as already public. Local tracking refs (`refs/remotes/origin/*`) are not trusted, since they can be stale or hand-made. If the remote cannot be asked (no network, a timeout after 60 s, an unreadable answer), the push is refused with exit code 2: a public push needs the network. The hook first checks with `git ls-remote --get-url` that the question goes to the repository receiving the push: git hands the hook the push URL after push rewriting, and `git ls-remote` applies fetch rewriting (`url.<base>.insteadOf`) to it again. When the two name different repositories (compared by host and path: scheme, user, credentials, port, `.git`, a trailing slash and letter case do not count), the push is refused with exit code 2 and both URLs named, credentials masked; remove or narrow the rewrite, or push from a clone without it;
- every commit that would be new on the public remote is checked: its raw message (and a merged tag embedded in it), its author and committer e-mail against `hygiene.allowedEmail`, every added line and every touched path; merges by what they add relative to their first parent, plus the merged commits themselves; annotated tag messages and tagger e-mails;
- content git treats as binary is scanned too: files marked `-diff` or `binary`, text with NUL bytes, UTF-16 (with or without a BOM) and binary data. A clean text line is scanned whole. A line holding NUL, other control bytes or invalid UTF-8 is read as UTF-8, with its NUL bytes dropped and as UTF-16, and in those readings a pattern only counts inside a run of 8 or more printable characters, and names shorter than 6 characters (host, user, account, plain denylist entries) are not applied, so random bytes cannot produce a hit;
- a binary that trips a pattern by chance is cleared by listing it in the tracked `.hygiene-allow-binaries` as `<sha256>  <path>` after review. The entry holds only for a file the scanner classifies as binary (a NUL byte in its first 8000 bytes, not UTF-16 text), only for exactly that content at exactly that path, as of the pushed tip; every push that includes it prints `allowed binary: <path>`. The entry exempts the identity, path and denylist patterns only: private-key blocks and the provider token shapes (GitHub, Anthropic, OpenAI, AWS access key id, Slack, npm, Google, Stripe, JWT) are still matched in every reading of a listed binary;
- an author, committer or tagger line that cannot be fully parsed refuses the push (`<role> ident malformed`);
- on a hit it prints commit, `file:line` (or `commit message` / `tag message` / `path` / `ref` / `author e-mail not allowed`) and the pattern name, and refuses the push. Locations are printed masked (`src/[...]/file.js`); no matched text is ever printed;
- a scan that fails (a git error, an invalid regex in `.hygiene-denylist`, a line over the time budget, git older than 2.31) refuses with exit code 2.

## On a hit

1. Remove the text from the commit that added it (amend, or rebuild the branch). A later commit that deletes it does not help: the earlier commit would still be published.
2. If the hit is a deliberate false positive, add `hygiene-allow: <pattern-name>` on that same line (for example in a trailing comment). It covers exactly that pattern on exactly that line. There is no switch that skips the scan.
3. If a real secret was ever pushed anywhere, rotate it; removing it is not enough.
4. `author e-mail not allowed`: recreate the commit with an allowed identity, or add the address with `git config --add hygiene.allowedEmail <address>` if it is meant to be public.

## Limits

- The scan is pattern based. A secret in an unusual shape, a private name not in `.hygiene-denylist`, or a name split across lines is not caught. Not closed from the independent check's evasion list: secrets encoded (base64, hex, rot13) other than Basic auth, secrets assembled at runtime from pieces, unquoted secrets in code (outside env/YAML/ini lines), public IPv4 addresses and hostnames of private machines that are not remotes or the local host name, and personal names of people.
- Binary content is scanned as text readings only: compressed or encrypted data (PNG/JPEG pixels, zip, PDF streams), and text inside images, is not readable by a pattern. Screenshots need a look by eye.
- Host identity, the `gh` account, the private remotes, the git e-mail, `hygiene.allowedEmail` and the denylist are only known locally. CI applies the `everywhere` set: secrets, private-key blocks, and home, drive and UNC paths and private IPv4 addresses.
- The hook runs only in clones where `npm run setup:git` was run, from the installed copy, and not with `--no-verify`.
- If the installed directory is deleted or renamed while `core.hooksPath` still points at it, git runs no hook at all, silently; nothing inside git can prevent that. The mitigations: `npm run setup:git -- --check`, the warning in `npm test` and `npm run hygiene`, and a server-side backstop the owner enables on the public repository: GitHub secret scanning with push protection, and a branch ruleset for `main` (no force pushes, no deletion). These cannot know local names, but they stop secrets and rewrites even when the local hook did not run.
- The hash check of the installed copy is tamper evidence, not tamper proofing: whoever can edit the installed wrapper can bypass it.
- Short machine and user names (under 6 characters) are not matched on text lines that contain ANSI escape codes or non-UTF-8 bytes, nor inside binary metadata: in such lines a short name matches random bytes by chance. File paths, tokens and longer names are still matched there.
- In the push scan, a UTF-16 text file's lines hold NUL bytes, so names shorter than 6 characters are not applied to them there; the tree, `dist` and pack scans transcode UTF-16 and apply every pattern.
- A binary listed in `.hygiene-allow-binaries` is scanned at that content only for private-key blocks and the provider token shapes (GitHub, Anthropic, OpenAI, AWS access key id, Slack, npm, Google, Stripe, JWT); host and user names, the account, paths, the other secret shapes and the denylist are not checked in it. The list is reviewed like code and published with it.
- A tag can publish any commit it points at; the hook scans every commit the tag would make new on the public remote, like a branch push, so tags get the same gate.
- "New on the public remote" is what the remote does not report in `git ls-remote` at push time. A commit the remote still stores but no longer references (a deleted branch) counts as new and is scanned again; a remote tip whose object this clone does not have is ignored, so more is scanned, not less. A public push needs the network: without an answer from the remote it is refused. Guard version 4 introduced this; a clone with an older installed guard is warned that it is outdated and must re-run `npm run setup:git`.
- Anything the public remote advertises counts as already public, including refs others pushed there, such as pull request refs (`refs/pull/*`): their content is public already.
- When a tip the public remote reports is not in this clone, more is scanned; old public commits can then be refused (for example on e-mails), and the refusal says to run `git fetch <remote>` and push again.
- The remote is asked over a second connection. Without a credential helper this can mean a second credential prompt.
- At the 60 s bound the whole process tree of `git ls-remote` is ended (git's transport helper, ssh): `taskkill /T /F` on Windows, the process group elsewhere. Tested on Windows only; the POSIX process-group path is not tested on this machine.
- The installed hook refuses a public push while the checkout carries a newer guard version, but only from guard version 5 on: a clone whose installed guard is v3 or v4 does not have that rule and must be updated by hand (`npm run setup:git`), which is why the gate above begins with it.
- Git older than 2.31 is refused rather than scanned with a weaker diff.
