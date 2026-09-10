# GitGuardian triage - 2026-09-10

PR #1 incident 29342119 points to the PostgreSQL service password in `.github/workflows/ci.yml`, including the original commit. This is a synthetic credential for the disposable CI database, not a deployed database credential. The incident was classified as `test_credential` through the GitGuardian API after checking the reported locations.

No scanner was disabled, no path-wide exclusion was added, and commit history was preserved. This record requests a fresh PR scan after triage; merging remains conditional on successful checks.
