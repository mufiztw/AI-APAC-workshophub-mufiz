#!/usr/bin/env bash
# PostToolUse hook: run ESLint on an edited TypeScript file in app/ or api/.
# Exit 2 on lint errors (output is fed back to Claude so it fixes them).
# If pnpm is unavailable, warn and exit 0 so edits are not blocked.

set -u

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

[ -z "$file" ] && exit 0
case "$file" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

case "$file" in
  "$root"/app/*) pkg="$root/app" ;;
  "$root"/api/*) pkg="$root/api" ;;
  *) exit 0 ;;
esac

if ! command -v pnpm >/dev/null 2>&1; then
  echo "post-edit-lint: pnpm not found, skipping lint for $file" >&2
  exit 0
fi

out=$(cd "$pkg" && pnpm exec eslint "$file" 2>&1)
status=$?
if [ $status -ne 0 ]; then
  echo "ESLint failed for $file (must pass 'make lint'):" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
