#!/usr/bin/env bash
set -euo pipefail
# Only artifacts from a successful protected develop deployment are eligible.
while IFS=$'\t' read -r run_id source_sha; do
  git cat-file -e "${source_sha}^{commit}" 2>/dev/null || continue
  git merge-base --is-ancestor "${source_sha}" HEAD || continue
  git diff --quiet "${source_sha}" HEAD -- src scripts certs package.json package-lock.json infra/canary || continue
  gh run download "${run_id}" --repo "${GITHUB_REPOSITORY}" --name "auth-bundle-${source_sha}" --dir dist
  PROMOTED_SHA="${source_sha}" node scripts/bundle-manifest.mjs verify
  exit 0
done < <(gh run list --repo "${GITHUB_REPOSITORY}" --workflow deploy.yml --branch develop --status success --limit 30 --json databaseId,headSha --jq '.[] | [.databaseId, .headSha] | @tsv')
echo 'No successful hml bundle matches this production source tree.' >&2
exit 1
