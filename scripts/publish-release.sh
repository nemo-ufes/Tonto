#!/usr/bin/env bash

set -euo pipefail

REPO="${REPO:-nemo-ufes/Tonto}"
PR_NUMBER="${PR_NUMBER:-}"
RELEASE_VERSION="${RELEASE_VERSION:-0.4.13}"
CLI_VERSION="${CLI_VERSION:-0.4.14}"
TPM_VERSION="${TPM_VERSION:-0.3.4}"

CLI_PACKAGE="tonto-cli"
TPM_PACKAGE="tonto-package-manager"
EXTENSION_ID="lenke.tonto"

CLI_TARBALL="packages/tonto/${CLI_PACKAGE}-${CLI_VERSION}.tgz"
TPM_TARBALL="packages/tpm/${TPM_PACKAGE}-${TPM_VERSION}.tgz"
VSIX_PATH="packages/extension/tonto-${RELEASE_VERSION}.vsix"

run() {
  echo "+ $*"
  "$@"
}

fail() {
  echo "release failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

require_file() {
  [[ -f "$1" ]] || fail "missing release artifact: $1"
}

has_vsce_publisher_login() {
  npx vsce ls-publishers 2>/dev/null | grep -Eiq "^lenke$"
}

ensure_artifact() {
  local artifact_path="$1"
  local artifact_name
  local artifact_dir

  if [[ -f "$artifact_path" ]]; then
    return
  fi

  artifact_name="$(basename "$artifact_path")"
  artifact_dir="$(dirname "$artifact_path")"

  echo "$artifact_path is missing; downloading $artifact_name from GitHub release $RELEASE_VERSION."
  run mkdir -p "$artifact_dir"
  run gh release download "$RELEASE_VERSION" --repo "$REPO" --pattern "$artifact_name" --dir "$artifact_dir" --clobber
  require_file "$artifact_path"
}

package_version() {
  node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).version)" "$1"
}

npm_version_is_published() {
  npm view "$1@$2" version >/dev/null 2>&1
}

assert_package_version() {
  local package_json="$1"
  local expected_version="$2"
  local actual_version

  actual_version="$(package_version "$package_json")"
  [[ "$actual_version" == "$expected_version" ]] ||
    fail "$package_json is version $actual_version, expected $expected_version"
}

require_command git
require_command gh
require_command node
require_command npm
require_command npx

[[ -z "$(git status --porcelain)" ]] || fail "working tree is not clean"
[[ -n "$PR_NUMBER" ]] || fail "PR_NUMBER is required. Run: PR_NUMBER=<merged-release-pr> npm run release:publish"

assert_package_version "package.json" "$RELEASE_VERSION"
assert_package_version "packages/extension/package.json" "$RELEASE_VERSION"
assert_package_version "packages/tonto/package.json" "$CLI_VERSION"
assert_package_version "packages/tpm/package.json" "$TPM_VERSION"

pr_state="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state --jq ".state")"
pr_merged_at="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json mergedAt --jq ".mergedAt")"
[[ "$pr_state" == "MERGED" && "$pr_merged_at" != "null" ]] ||
  fail "PR #$PR_NUMBER is not merged yet. Merge it first, then rerun this script."

run git fetch origin main --tags
run git checkout main
run git pull --ff-only origin main

merge_commit="$(gh pr view "$PR_NUMBER" --repo "$REPO" --json mergeCommit --jq ".mergeCommit.oid")"
[[ "$merge_commit" != "null" ]] || fail "PR #$PR_NUMBER has no merge commit"
run git merge-base --is-ancestor "$merge_commit" HEAD

gh release view "$RELEASE_VERSION" --repo "$REPO" >/dev/null ||
  fail "GitHub release $RELEASE_VERSION does not exist. Expected the prepared draft release to exist."

ensure_artifact "$CLI_TARBALL"
ensure_artifact "$TPM_TARBALL"
ensure_artifact "$VSIX_PATH"

release_is_draft="$(gh release view "$RELEASE_VERSION" --repo "$REPO" --json isDraft --jq ".isDraft")"
[[ "$release_is_draft" == "true" ]] || echo "GitHub release $RELEASE_VERSION is already public; continuing."

run npm whoami

if [[ -z "${VSCE_PAT:-}" ]] && ! has_vsce_publisher_login; then
  fail "VSCE_PAT is not set and no stored vsce login for publisher lenke was found. Run: npx vsce login lenke"
fi

if npm_version_is_published "$CLI_PACKAGE" "$CLI_VERSION"; then
  echo "$CLI_PACKAGE@$CLI_VERSION is already published on npm; skipping npm publish."
else
  run npm publish "$CLI_TARBALL" --tag latest
fi

if npm_version_is_published "$TPM_PACKAGE" "$TPM_VERSION"; then
  echo "$TPM_PACKAGE@$TPM_VERSION is already published on npm; skipping npm publish."
else
  run npm publish "$TPM_TARBALL" --tag latest
fi

vsce_publish_args=(publish --packagePath "$VSIX_PATH" --skip-duplicate)
if [[ -n "${VSCE_PAT:-}" ]]; then
  vsce_publish_args+=(--pat "$VSCE_PAT")
else
  echo "VSCE_PAT is not set; using stored vsce login for publisher lenke."
fi

run npx vsce "${vsce_publish_args[@]}"

ovsx_publish_args=(publish "$VSIX_PATH" --skip-duplicate)
if [[ -n "${OVSX_PAT:-}" ]]; then
  ovsx_publish_args+=(--pat "$OVSX_PAT")
else
  echo "OVSX_PAT is not set; using stored ovsx login if available."
fi

run npx ovsx "${ovsx_publish_args[@]}"

if [[ "$release_is_draft" == "true" ]]; then
  run gh release edit "$RELEASE_VERSION" --repo "$REPO" --draft=false --latest --target main
else
  echo "GitHub release $RELEASE_VERSION is already public; skipping release publish."
fi

run npm view "$CLI_PACKAGE@$CLI_VERSION" version
run npm view "$TPM_PACKAGE@$TPM_VERSION" version
run npx vsce show "$EXTENSION_ID"
run npx ovsx get "$EXTENSION_ID"
run gh release view "$RELEASE_VERSION" --repo "$REPO" --web

echo "release $RELEASE_VERSION completed"
