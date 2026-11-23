#!/usr/bin/env bash
# PostToolUse hook: format an edited file with Prettier.
# Always exits 0: an empty/deleted/unsupported path or a missing pnpm/Prettier is skipped quietly,
# and formatting problems are only reported on stderr, never blocking the edit.

set -u

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input" 2>/dev/null)
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0
command -v pnpm >/dev/null 2>&1 || exit 0

# Prettier is a devDependency of app/ and api/ only; run from the package that owns the file,
# falling back to app/ for other files. Prettier finds .prettierrc relative to the file itself.
case "$file" in
  "$root"/api/*) dir="$root/api" ;;
  *) dir="$root/app" ;;
esac

# --ignore-unknown skips files Prettier has no parser for; .prettierignore is still honoured.
out=$(cd "$dir" && pnpm exec prettier --write --ignore-unknown "$file" 2>&1) \
  || echo "post-edit-format: prettier failed for $file: $out" >&2
exit 0
