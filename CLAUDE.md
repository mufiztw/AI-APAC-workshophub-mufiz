# WorkshopHub

## Project Context

WorkshopHub is a workshop booking application, structured as a pnpm monorepo.

| Package | Path   | Stack                          |
| ------- | ------ | ------------------------------ |
| API     | `api/` | Express + Prisma (TypeScript)  |
| Web app | `app/` | React + TypeScript (Vite)      |

Other directories: `database/`, `docs/`, `scripts/`, `security/`, `hooks/`, `setup/`.

### Common Commands

Run from the repo root via the Makefile:

- `make setup` — install deps, generate Prisma client, push schema, seed
- `make dev` — start frontend and backend in dev mode
- `make test` — run all tests (unit + integration)
- `make test-unit` — API unit tests only (no database required)
- `make lint` — ESLint on all packages

## Team Norms

- **No `any`.** Use precise types, `unknown` with narrowing, or generics.
- **No direct Prisma in routes.** Route handlers call services/repositories; only those layers touch the Prisma client.
- **All code must pass `make test` and `make lint`** before it is considered done or committed.
- **Never commit secrets or .env files.**

## MCP Permissions

Two MCP servers are enabled for this repo: `jira` and `github`.

### Jira

**Allowed:**
- Read issues (`getJiraIssue`, search, comments).
- Copy a card, producing a working copy titled with the engineer's name plus the original title.
- Transition the **working copy** through the workflow (for example to In Progress).
- Comment on a card.

**Forbidden:**
- Modifying, deleting, or moving the **original backlog card**. The original stays untouched; all work happens on the copy.

### GitHub

**Allowed:**
- Read repository and user information.
- Create pull requests, **only when the user asks for one**.

**Forbidden:**
- Force-pushing through any tool (`push_files`, `create_or_update_file`, or otherwise).

## AGENT_BOUNDARY

What AI agents may and may not do in this repo:

- **`.env` files and secrets are strictly off-limits.** Agents must not read, edit, copy, stage, or commit them (use `.env.example` for reference). This is enforced by the PreToolUse hook `.claude/hooks/pre-tool-guard.sh`.
- **The `planner` and `reviewer` subagents are read-only.** They inspect code and report; they never modify files, stage, or commit.
- **All production changes follow Red-Green-Refactor TDD.** Write a failing test first, then the minimal code to pass, then refactor.
- **Agents never push to a remote.** Pushing is a human action.
- **Agents never bypass git hooks.** `--no-verify` is forbidden, as are force pushes and other destructive git commands (also blocked by the guard hook).
