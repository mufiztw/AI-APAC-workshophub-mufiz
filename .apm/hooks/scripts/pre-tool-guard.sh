#!/usr/bin/env bash
# PreToolUse guard: blocks .env access and destructive git commands.
# Reads the tool call JSON on stdin. Exit 2 = block (stderr is shown to Claude).
# Exit 0 = allow.

set -u

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")

block() {
  echo "BLOCKED by .apm/hooks/scripts/pre-tool-guard.sh: $1" >&2
  exit 2
}

# Matches .env, .env.local, .env.production, ... but not .env.example / .env.sample / .env.template
is_secret_env_path() {
  local base
  base=$(basename -- "$1")
  case "$base" in
    .env.example | .env.sample | .env.template) return 1 ;;
    .env | .env.*) return 0 ;;
    *) return 1 ;;
  esac
}

case "$tool" in
  Read | Edit | Write | MultiEdit | NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
    if [ -n "$path" ] && is_secret_env_path "$path"; then
      block "$tool on '$path' is not allowed. Never read or edit .env files (use .env.example)."
    fi
    ;;

  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")

    # .env files: ignore the allowed template variants, then look for any .env token.
    stripped=$(sed -E 's/\.env\.(example|sample|template)//g' <<<"$cmd")
    if grep -Eq '(^|[[:space:]/"'"'"'=<>])\.env(\.[A-Za-z0-9_-]+)?($|[[:space:]"'"'"';|&<>)])' <<<"$stripped"; then
      block "command references a .env file. Never read, copy or stage .env files."
    fi

    # git --no-verify (skips hooks), on any git subcommand
    if grep -Eq '(^|[[:space:];&|(])git[[:space:]].*--no-verify' <<<"$cmd"; then
      block "git --no-verify skips hooks and is not allowed."
    fi

    # git push --force / -f / --force-with-lease / +refspec
    if grep -Eq '(^|[[:space:];&|(])git[[:space:]]+push([[:space:]]|$)' <<<"$cmd"; then
      if grep -Eq '(^|[[:space:]])(--force([[:space:]=]|$)|--force-with-lease|-[a-zA-Z]*f[a-zA-Z]*([[:space:]]|$)|\+[^[:space:]]+)' <<<"$cmd"; then
        block "force push is not allowed."
      fi
    fi

    # Other destructive git commands
    if grep -Eq '(^|[[:space:];&|(])git[[:space:]]+reset[[:space:]]+.*--hard' <<<"$cmd"; then
      block "git reset --hard discards work and is not allowed."
    fi
    if grep -Eq '(^|[[:space:];&|(])git[[:space:]]+clean[[:space:]]+.*-[a-zA-Z]*f' <<<"$cmd"; then
      block "git clean -f deletes untracked files and is not allowed."
    fi
    ;;
esac

exit 0
