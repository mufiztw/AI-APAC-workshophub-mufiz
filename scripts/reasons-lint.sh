#!/usr/bin/env bash
# Sensor: validate the REASONS canvas for the current branch's Jira ticket.
#
# The canvas is produced by /spdd-reasons-canvas as
#   spdd/prompt/<TICKET>-<YYYYMMDDHHmm>-[<Action>]-<scope>-<description>.md
# and holds seven H2 sections: Requirements, Entities, Approach, Structure,
# Operations, Norms, Safeguards. This script checks that at least one canvas for
# the ticket exists (spdd/prompt, spdd/feat or spdd root) and that every such file
# has all seven sections, each non-empty and free of TODO/placeholder markers.
#
# Usage: scripts/reasons-lint.sh [branch-name]
# Env:   SPDD_DIR  override the spdd directory (default: <repo root>/spdd)

set -u

SECTIONS="Requirements Entities Approach Structure Operations Norms Safeguards"
# Placeholder markers (case-insensitive) that mean a section is not really written.
PLACEHOLDER_RE='\bTODO\b|\bTBD\b|\bFIXME\b|placeholder|lorem ipsum|<fill[ -]?in>|\[fill[ -]?in\]'

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
spdd_dir="${SPDD_DIR:-$root/spdd}"
branch="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

fail() { echo "reasons-lint: FAIL - $1" >&2; }

if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  fail "no branch checked out (detached HEAD), cannot work out the Jira ticket."
  exit 1
fi

# latc-3-foo or feature/latc-3-foo -> LATC-3
if [[ "$branch" =~ ^(feature/)?([Ll][Aa][Tt][Cc])-([0-9]+)(-|$) ]]; then
  ticket="LATC-${BASH_REMATCH[3]}"
else
  fail "branch '$branch' has no Jira ticket (expected latc-<number>-<description>)."
  echo "  Run scripts/branch-name-check.sh for the naming rule." >&2
  exit 1
fi

if [ ! -d "$spdd_dir" ]; then
  fail "spdd directory not found at $spdd_dir."
  echo "  Run /spdd-analysis then /spdd-reasons-canvas for $ticket." >&2
  exit 1
fi

# Canvas files for this ticket (the file name starts with the ticket key).
files=()
while IFS= read -r f; do
  [ -n "$f" ] && files+=("$f")
done < <(
  {
    find "$spdd_dir/prompt" -maxdepth 1 -type f -iname "$ticket-*.md" 2>/dev/null
    find "$spdd_dir/feat" -maxdepth 1 -type f -iname "$ticket-*.md" 2>/dev/null
    find "$spdd_dir" -maxdepth 1 -type f -iname "$ticket-*.md" 2>/dev/null
  } | sort -u
)

if [ "${#files[@]}" -eq 0 ]; then
  fail "no REASONS canvas found for $ticket."
  echo "  Expected: spdd/prompt/$ticket-<timestamp>-[Feat]-<description>.md" >&2
  echo "  Create it with /spdd-analysis then /spdd-reasons-canvas for $ticket." >&2
  exit 1
fi

# Prints the body of "## <section>" up to the next "## " heading (code fences kept;
# "## " lines inside fences are ignored). Prints nothing if the heading is absent.
section_body() {
  awk -v want="$2" '
    /^```/ { if (insec) print; fence = !fence; next }
    !fence && /^##[[:space:]]/ {
      title = $0
      sub(/^##[[:space:]]+/, "", title)
      sub(/[[:space:]]+$/, "", title)
      insec = (title == want)
      next
    }
    insec { print }
  ' "$1"
}

has_heading() {
  awk -v want="$2" '
    /^```/ { fence = !fence; next }
    !fence && /^##[[:space:]]/ {
      title = $0
      sub(/^##[[:space:]]+/, "", title)
      sub(/[[:space:]]+$/, "", title)
      if (title == want) found = 1
    }
    END { exit found ? 0 : 1 }
  ' "$1"
}

errors=0
for file in "${files[@]}"; do
  rel="${file#"$root"/}"
  for section in $SECTIONS; do
    if ! has_heading "$file" "$section"; then
      echo "reasons-lint: FAIL - $rel: missing section '## $section'." >&2
      errors=$((errors + 1))
      continue
    fi
    body=$(section_body "$file" "$section")
    if [ -z "$(printf '%s' "$body" | tr -d '[:space:]')" ]; then
      echo "reasons-lint: FAIL - $rel: section '## $section' is empty." >&2
      errors=$((errors + 1))
      continue
    fi
    hit=$(printf '%s\n' "$body" | grep -Eiom1 "$PLACEHOLDER_RE" || true)
    if [ -n "$hit" ]; then
      echo "reasons-lint: FAIL - $rel: section '## $section' contains a placeholder ('$hit')." >&2
      errors=$((errors + 1))
    fi
  done
done

if [ "$errors" -gt 0 ]; then
  echo "  Fix the canvas (e.g. /spdd-prompt-update @<canvas file>) so all seven REASONS sections" >&2
  echo "  ($SECTIONS) are filled in with no TODO/placeholder text." >&2
  exit 1
fi

echo "reasons-lint: OK ($ticket: ${#files[@]} canvas file(s), all 7 REASONS sections complete)"
exit 0
