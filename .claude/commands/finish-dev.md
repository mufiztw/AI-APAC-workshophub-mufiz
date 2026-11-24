---
allowed-tools: AskUserQuestion, Bash, Read, Skill, mcp__github__create_pull_request,
  mcp__github__get_me, mcp__jira__getJiraIssue, mcp__jira__searchJiraIssuesUsingJql,
  mcp__jira__getAccessibleAtlassianResources, mcp__jira__transitionJiraIssue, mcp__jira__addOrEditJiraIssueComment
argument-hint:
- jira-card-key
- defaults to the card in the branch name
description: Finish a card - run sensors, commit, push, open a PR, and move the Jira
  working copy to In Review
---

# Finish dev

Wrap up work on the current branch. Running `/finish-dev` is the user's explicit request to commit, push and open a PR for this branch, but confirm each outward-facing step as described below.

## Hard rules

- **Never** force-push, use `--no-verify`, or push to `main`.
- **Never** modify the original backlog card. Only the **working copy** (the card titled `<name> - <original title>`) is transitioned. The original card may only receive a comment.
- Never stage or commit `.env` files or secrets.

## 1. Preconditions

1. Run `git branch --show-current`. If it is `main` or does not match `^(feature/)?latc-[0-9]+-[a-z0-9-]+$`, stop and tell the user.
2. Work out the original card key from the branch (`latc-3-...` gives `LATC-3`, or use `$ARGUMENTS`).
3. Run `/sensor-and-fix`. Do not continue until all five sensors are green.

## 2. Commit

Run `git status`. If there are uncommitted changes, use the `commit` skill (conventional message prefixed with the card key, confirmed with the user, no push). If the tree is clean, skip this step.

## 3. Push

Show the user the commits that will be pushed (`git log origin/<branch>..HEAD --oneline`, or `git log -5 --oneline` if the branch is new) and use AskUserQuestion to confirm. After approval, run `git push -u origin <branch>`. If the push is rejected, stop and report; do not force-push.

## 4. Open a PR

1. Look for a PR template (`.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/`) and follow it if present.
2. Draft the title as `<CARD> <summary>` and a body with a short summary, the acceptance criteria covered (from `stories/` or the Jira card), and how it was verified (`make test`, `make lint`, `make format-check`).
3. Show the draft to the user and, once they approve, create it with `mcp__github__create_pull_request` against `main`. End the body with the attribution line given in the session's instructions.
4. Report the PR URL.

## 5. Update the Jira working copy

1. Find the working copy: the `Working copy:` line in `stories/<card>-*.md`, or search with JQL for a card titled with `<original title>` in the same project. If several candidates exist, or none, ask the user.
2. Confirm it is **not** the original card.
3. Transition it with `transitionJiraIssue` using `transitionName: "In Review"`. If that name is not available, list the available transitions from the error and ask the user which to use.
4. Optionally add a comment on the working copy with the PR link.

## 6. Report

Give the branch, commit hashes, PR URL, and the working copy's new Jira status. Then stop.