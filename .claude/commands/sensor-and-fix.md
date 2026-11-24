---
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
description: Run every quality sensor (REASONS canvas, branch name, tests, lint, format)
  and fix what fails
---

# Sensor and fix

Run all the sensors below from the repo root, in order, and fix each failure before moving on. Repeat the full run until everything is green, at most **3 rounds**. If something is still red after round 3, stop and report exactly what is failing and why.

## Sensors

1. `./scripts/reasons-lint.sh`: the REASONS canvas for this branch's Jira ticket exists and all 7 sections are filled in.
2. `./scripts/branch-name-check.sh`: branch matches `^(feature/)?latc-[0-9]+-[a-z0-9-]+$`.
3. `make test`
4. `make lint`
5. `make format-check`

Run all five even if an early one fails, so the report shows everything that is red.

## Fixing failures

- **reasons-lint**: read the error. Fill in the missing or empty section, or remove the TODO/placeholder text, in the canvas file under `spdd/prompt/`. Follow SPDD: the canvas is the contract, so update it (see `/spdd-prompt-update`) rather than weakening the check. If no canvas exists at all, tell the user to run `/spdd-analysis` and `/spdd-reasons-canvas`; do not invent one.
- **branch-name-check**: do not rename or switch branches on your own. Tell the user the correct name and the command to run. On `main`, ask before creating a branch.
- **make test**: find the root cause and fix the production code. Follow Red-Green-Refactor: never delete, skip, or loosen a test just to get green. If a test is genuinely wrong, say so and explain before changing it.
- **make lint**: run the package's ESLint fix (`pnpm --filter @workshophub/app exec eslint src --ext .ts,.tsx --fix`, `pnpm --filter @workshophub/api exec eslint src tests --ext .ts --fix`), then fix whatever remains by hand. No `any`, and no `eslint-disable` to hide a problem.
- **make format-check**: run Prettier on the files it reports (`pnpm --filter <pkg> exec prettier --write <files>`), then re-check.

## Rules

- Never read or edit `.env` files. Never use `--no-verify`. Never commit or push from this command; leave that to `/commit` and `/finish-dev`.
- Make the smallest change that fixes each failure. Do not refactor unrelated code.

## Report

End with a table of the five sensors (pass or fail), the files you changed, and anything left for the user.