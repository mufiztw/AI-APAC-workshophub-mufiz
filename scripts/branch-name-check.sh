#!/usr/bin/env bash
# Sensor: enforce the branch naming convention.
# Valid:   latc-3-waitlist-when-session-full, feature/latc-3-waitlist
# Invalid: main, LATC-3-foo, latc-3, feature/foo
#
# Usage: scripts/branch-name-check.sh [branch-name]
# With no argument the current git branch is checked.

set -u

PATTERN='^(feature/)?latc-[0-9]+-[a-z0-9-]+$'

branch="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  echo "branch-name-check: FAIL - no branch checked out (detached HEAD)." >&2
  echo "  Check out a branch named like 'latc-<number>-<short-description>' and retry." >&2
  exit 1
fi

if [[ "$branch" =~ $PATTERN ]]; then
  echo "branch-name-check: OK ($branch)"
  exit 0
fi

echo "branch-name-check: FAIL - branch '$branch' does not match $PATTERN" >&2
if [ "$branch" = "main" ]; then
  echo "  Work is not allowed directly on 'main'. Create a feature branch:" >&2
else
  echo "  Use lowercase 'latc-<number>-<short-kebab-description>' (optionally prefixed 'feature/')." >&2
  echo "  Rename the current branch with:" >&2
fi
echo "    git checkout -b latc-<number>-<short-description>   (or: git branch -m <new-name>)" >&2
exit 1
