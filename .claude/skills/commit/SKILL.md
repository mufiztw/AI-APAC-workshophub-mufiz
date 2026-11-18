---
name: commit
description: Commit WorkshopHub changes with a conventional commit message prefixed by the Jira card number from the branch name (e.g. LATC-2). Refuses on main, confirms the message with the user, never pushes.
---

# Commit

Create a git commit for the current changes in WorkshopHub. Follow the steps in order. Do not push at any point.

## 1. Check the branch

Run `git branch --show-current`.

- If the branch is `main`, **stop and refuse**. Tell the user to create or switch to a feature branch first (for example `LATC-2-short-description`). Do not commit, and do not create the branch unless the user asks.

## 2. Show the current state

Run these and present the results to the user:

- `git status`
- `git diff --stat` (unstaged) and `git diff --cached --stat` (staged)

Give a short plain-language summary of what changed (a few lines, not the full diff). Read the actual diff with `git diff` / `git diff --cached` if you need it to write an accurate summary.

If there is nothing to commit, say so and stop.

## 3. Check for secrets

Before staging anything, check the changed files:

- Never stage or commit `.env` files, credentials, private keys, tokens, or anything that looks like a secret (this is a team norm in CLAUDE.md).
- Scan the diff for likely secrets (API keys, passwords, connection strings with credentials).
- If anything suspicious is found, **stop**, tell the user which file and why, and do not commit it. Suggest adding it to `.gitignore` or removing it.

## 4. Find the Jira card number

Extract the card number from the branch name with the pattern `[A-Z][A-Z0-9]+-[0-9]+` (e.g. `LATC-2` from `LATC-2-add-seat-display` or `feature/LATC-2-add-seat-display`).

- If the branch name contains one, use it.
- If not, **ask the user** for the Jira card number. Do not guess or invent one, and do not commit without one.

## 5. Suggest a commit message and confirm

Write a conventional commit message with the Jira card as prefix:

```
LATC-2 feat(app): show seats remaining on session card
```

Format: `<CARD> <type>(<scope>): <summary>`

- `type`: one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`, `build`, `ci`.
- `scope`: optional, e.g. `app`, `api`, `database`, `docs`.
- Summary: imperative mood, lowercase, no trailing period, ideally under 72 characters total.
- Add a short body only if the change needs explanation.

Show the proposed message and the list of files to be committed, then **ask the user to confirm or edit**. Do not commit until they approve. If they change the message, use their version (still make sure the Jira prefix is present).

## 6. Stage files

Stage only the files relevant to the change, by explicit path (`git add <path> ...`). Do not use `git add -A` or `git add .`. If files are already staged and correct, leave them. Do not stage unrelated changes; mention them to the user instead.

## 7. Commit

Run `git commit` with the approved message. Pass the message with `-m` (use multiple `-m` flags or a heredoc for a body).

- **Never use `--no-verify`** or otherwise skip hooks.
- If a hook fails, show the failure to the user, fix the underlying issue if it is clearly within scope (or ask), then re-stage and create a **new** commit. Do not amend a previous commit unless the user asks.
- If the project's norms apply (`make lint` and `make test` must pass), mention it if they have not been run and offer to run them.

End the commit message with the attribution line required by the session's instructions, when one is given.

## 8. Stop

Run `git log -1 --stat` to show the result, report the commit hash and message, and **stop**. Do **not** run `git push`. If the user wants to push, they will ask separately.

## Rules summary

- Refuse on `main`.
- Jira card prefix is required (from the branch, otherwise ask).
- Confirm the message with the user before committing.
- Never commit secrets or `.env` files.
- Never use `--no-verify`.
- Never push.
