---
name: publish-release
description: >-
  Release-and-publish playbook for the Tonto monorepo. Bumps a patch version on
  the three publishable packages (tonto-cli, tpm, extension), publishes them to
  their registries (npm for tonto-cli + tpm; VS Code Marketplace + Open VSX for
  the extension), and cuts a GitHub release with the build artifacts attached.
  Trigger when the user asks to "publish", "release", "ship", "cut a release",
  "bump and publish", or "push a new version" of Tonto / the CLI / tpm / the
  VS Code extension.
---

# Tonto release & publish

This repo is an npm-workspaces monorepo (`tonto-workspaces`, root `package.json`).
Package manager is **npm** (lockfileVersion 3). Three packages get published:

| Package dir            | npm/marketplace name      | Registry target                         | Current version |
| ---------------------- | ------------------------- | --------------------------------------- | --------------- |
| `packages/tonto`       | `tonto-cli`               | npm                                     | 0.4.11          |
| `packages/tpm`         | `tpm`                     | npm                                     | 0.3.2           |
| `packages/extension`   | `tonto` (publisher `lenke`) | VS Code Marketplace **+** Open VSX     | 0.4.10          |

> The versions above are a snapshot. **Always re-read the actual `version` field
> from each `package.json` before bumping** — never trust this table.

## Dependency graph → publish order is mandatory

```
tonto-cli ──┬──► tpm           (tpm depends on tonto-cli)
            └──► extension      (extension depends on tonto-cli AND tpm)
tpm ───────────► extension
```

Publish **tonto-cli first, then tpm, then the extension last.** A consumer
installing the extension or tpm must be able to resolve the freshly published
tonto-cli/tpm versions from npm, so those have to land first.

## Before you start — confirm with the user

Releasing is outward-facing and hard to undo (npm/marketplace versions cannot be
republished). Before any publish step, confirm:

1. **Working tree is clean / intended.** `git status` — there are already staged
   release changes on `release/*` branches; make sure what's committed is what
   should ship. Do not publish from a tree with unrelated junk.
2. **All three get the same kind of bump?** The user asked for "one version up"
   = a **patch** bump on each (`npm version patch`). Confirm patch vs minor/major
   if ambiguous.
3. **Auth is in place** (see next section). If a token is missing, stop and ask —
   do not attempt to publish without it.

## Required credentials (all local, none in the repo)

| Target              | Auth                                                                 | How to verify                          |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| npm                 | `npm login` session or `NPM_TOKEN` in `~/.npmrc`                     | `npm whoami`                           |
| VS Code Marketplace | `VSCE_PAT` env var (Azure DevOps PAT for publisher `lenke`)          | `npx vsce verify-pat lenke`            |
| Open VSX            | `OVSX_PAT` env var (Open VSX access token)                           | token must be set; `ovsx` is **not** installed — use `npx ovsx` |
| GitHub release      | `gh` CLI, already authed as `matheuslenke` (ssh, remote `nemo-ufes/Tonto`) | `gh auth status`               |

If any check fails, ask the user to run the login (suggest they use `! <cmd>` in
the prompt for interactive logins like `npm login` / `gcloud`-style auth).

## Procedure

### 0. Sanity build + test from the repo root

```bash
npm install            # ensure workspaces are linked
npm run build          # tsc -b + build all workspaces (builds tonto-cli → tpm → extension deps)
npm test               # vitest run
```

Do not proceed if the build or tests fail. Report the failure to the user.

### 1. Bump the three versions (patch)

Run inside **each** package dir. Use `--no-git-tag-version` so npm edits only
`package.json` (no per-package git tags — there's one release tag for the whole
cut, created in step 6):

```bash
npm version patch --no-git-tag-version --prefix packages/tonto       # tonto-cli   0.4.11 → 0.4.12
npm version patch --no-git-tag-version --prefix packages/tpm         # tpm         0.3.2  → 0.3.3
npm version patch --no-git-tag-version --prefix packages/extension   # extension   0.4.10 → 0.4.11
```

After bumping, **record the three new versions** — you need them in steps 2 and 6.

### 2. Re-point internal dependency ranges to the new versions ⚠️ critical

The internal deps currently point at stale ranges (and a `file:` path that will
**not resolve for npm consumers**). Update them to the versions you just bumped to:

- `packages/tpm/package.json` → `dependencies.tonto-cli` is `"file:../tonto"`.
  Change it to the new tonto-cli range, e.g. `"^0.4.12"`. (npm workspaces still
  symlinks the local copy for dev because the local version satisfies the range,
  so local development keeps working — but the **published** tarball now declares
  a real, resolvable dependency.)
- `packages/extension/package.json` → set:
  - `dependencies.tonto-cli` → `"^<new tonto-cli version>"` (was `^0.4.3`)
  - `dependencies.tonto-package-manager` → `"~<new tpm version>"` (was `~0.2.9`)

Then re-sync the lockfile and rebuild:

```bash
npm install
npm run build
```

> Why this matters: `vsce` packages the extension with `dependencies: true`
> (bundles `node_modules`). If the ranges are stale, the marketplace build can
> ship against an old tonto-cli/tpm. And tpm's `file:../tonto` published as-is
> breaks every `npm i tpm`.

### 3. Publish tonto-cli to npm (FIRST)

```bash
cd packages/tonto
npm run build            # tsc (prebuild cleans lib/)
npm pack                 # produces tonto-cli-<version>.tgz — keep it for the GitHub release
npm publish              # = "publish" script. Add --tag latest only if you want the latest dist-tag
```

Verify: `npm view tonto-cli@<new version> version` returns the new version.

### 4. Publish tpm to npm (SECOND)

tpm has **no publish script** — publish directly. Confirm step 2 changed its
`tonto-cli` dep off `file:`.

```bash
cd packages/tpm
npm run build
npm pack                 # tpm-<version>.tgz — keep for the release
npm publish              # tpm is public, no scope, so plain npm publish is fine
```

Verify: `npm view tpm@<new version> version`.

### 5. Publish the extension to Marketplace + Open VSX (LAST)

The extension's `vscode:prepublish` runs `npm run build && esbuild --minify`
automatically. Build the VSIX once, then publish the **same** artifact to both
registries (do not let each tool rebuild independently).

```bash
cd packages/extension

# Build the .vsix (runs vscode:prepublish under the hood)
npm run package          # = vsce package --allow-package-all-secrets
                         # produces tonto-<version>.vsix in packages/extension/

# Publish that exact VSIX to the VS Code Marketplace (publisher: lenke)
npx vsce publish --packagePath tonto-<version>.vsix   # needs VSCE_PAT

# Publish the SAME VSIX to Open VSX ("open vsix")
npx ovsx publish tonto-<version>.vsix -p "$OVSX_PAT"  # ovsx is run via npx; not a dep
```

Notes:
- `npm run publish` (= `vsce publish ...`) would re-package from source. Prefer
  `--packagePath` so Marketplace and Open VSX get a byte-identical VSIX.
- If the publisher/namespace doesn't exist yet on Open VSX, it must be created
  once: `npx ovsx create-namespace lenke -p "$OVSX_PAT"`.
- Keep the `.vsix` for the GitHub release in step 6.

Verify: extension shows the new version on
`https://marketplace.visualstudio.com/items?itemName=lenke.tonto` and
`https://open-vsx.org/extension/lenke/tonto`.

### 6. Commit, tag, and cut the GitHub release with artifacts

```bash
# From repo root — commit the version + dependency-range changes
git add packages/tonto/package.json packages/tpm/package.json \
        packages/extension/package.json package-lock.json
git commit -m "release: tonto-cli <v>, tpm <v>, extension <v>"

# Tag. Historic tags are bare semver (e.g. 0.4.7). Use the EXTENSION version as
# the headline release tag (Tonto = the user-facing extension), unless the user
# says otherwise.
git tag <extension-version>          # e.g. 0.4.11
git push origin HEAD --tags
```

Then create the release, attaching the three artifacts collected above:

```bash
gh release create <extension-version> \
  packages/extension/tonto-<ext-version>.vsix \
  packages/tonto/tonto-cli-<cli-version>.tgz \
  packages/tpm/tpm-<tpm-version>.tgz \
  --title "Tonto <extension-version>" \
  --notes "Release of:
- \`tonto-cli\` <cli-version> → npm
- \`tpm\` <tpm-version> → npm
- \`tonto\` extension <ext-version> → VS Code Marketplace + Open VSX

<summarize notable changes here, or pass --generate-notes>"
```

Use `--generate-notes` to auto-build notes from merged PRs if there's nothing
specific to call out.

## Verification checklist (report all to the user)

- [ ] `npm view tonto-cli@<v> version` and `npm view tpm@<v> version` resolve
- [ ] Marketplace + Open VSX pages show the new extension version
- [ ] `gh release view <tag>` lists all three artifacts
- [ ] Git tag pushed; release branch / main updated

## Failure & recovery notes

- **npm/marketplace versions are immutable.** If you publish a broken version,
  you cannot overwrite it — you must bump again and publish a new patch. Don't
  retry a failed publish with the same version after partial success; check
  `npm view`/the marketplace first to see whether it actually landed.
- **Partial release** (e.g. tonto-cli published but tpm failed): the published
  tonto-cli is fine; fix the tpm issue and continue from step 4. The extension,
  published last, will then reference correct deps.
- **`file:../tonto` leaked into a published tpm**: that publish is broken for
  consumers. Bump tpm and republish with the version range (step 2) — do not try
  to mutate the bad version.
- If `vsce`/`ovsx` rejects the PAT, it's an auth problem, not a code problem —
  re-issue the token; do not pass `--allow-package-all-secrets` to mask it.
