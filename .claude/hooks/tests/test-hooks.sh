#!/usr/bin/env bash
# Deterministic tests for the Claude Code hooks: feeds fake tool-call JSON to the scripts
# and asserts on the exit code (0 = allow, 2 = block). Run: bash .claude/hooks/tests/test-hooks.sh
cd "$(dirname "$0")/.." || exit 1
fail=0
check() { # name expected_exit script json
  local out code
  out=$(printf '%s' "$4" | ./"$3" 2>&1); code=$?
  if [ "$code" -eq "$2" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $2, got $code) $out"; fail=1; fi
}
bash_json() { jq -nc --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }
file_json() { jq -nc --arg t "$1" --arg p "$2" '{tool_name:$t,tool_input:{file_path:$p}}'; }

G=pre-tool-guard.sh
check "read .env blocked"            2 $G "$(file_json Read /repo/.env)"
check "edit api/.env blocked"        2 $G "$(file_json Edit /repo/api/.env)"
check "write .env.local blocked"     2 $G "$(file_json Write /repo/.env.local)"
check "read .env.example allowed"    0 $G "$(file_json Read /repo/.env.example)"
check "read normal file allowed"     0 $G "$(file_json Read /repo/app/src/App.tsx)"
check "cat .env blocked"             2 $G "$(bash_json 'cat .env')"
check "cp .env blocked"              2 $G "$(bash_json 'cp .env api/.env')"
check "cp .env.example allowed"      0 $G "$(bash_json 'cp .env.example .env.sample')"
check "push --force blocked"         2 $G "$(bash_json 'git push --force origin main')"
check "push -f blocked"              2 $G "$(bash_json 'git push -f')"
check "push --force-with-lease blk"  2 $G "$(bash_json 'git push --force-with-lease')"
check "push +refspec blocked"        2 $G "$(bash_json 'git push origin +main')"
check "plain push allowed"           0 $G "$(bash_json 'git push origin feature-x')"
check "commit --no-verify blocked"   2 $G "$(bash_json 'git commit --no-verify -m x')"
check "reset --hard blocked"         2 $G "$(bash_json 'git reset --hard HEAD~1')"
check "git status allowed"           0 $G "$(bash_json 'git status')"
check "normal commit allowed"        0 $G "$(bash_json 'git commit -m "fix: env handling"')"

P=post-edit-format.sh
check "post: empty path ignored"     0 $P '{"tool_input":{}}'
check "post: missing file ignored"   0 $P "$(file_json Edit /repo/app/src/nope.ts)"
check "post: unsupported file ok"    0 $P "$(file_json Edit "$(dirname "$0")/post-edit-format.sh")"
tmp=$(cd ../.. && pwd)/app/src/__hook_test.ts
printf 'const  a = "x";\n' > "$tmp"
trap 'rm -f "$tmp"' EXIT
check "post: formats ts file"        0 $P "$(file_json Write "$tmp")"
if [ "$(cat "$tmp")" = "const a = 'x'" ]; then echo "PASS  post: file reformatted"; else echo "FAIL  post: file not reformatted: $(cat "$tmp")"; fail=1; fi
exit $fail
