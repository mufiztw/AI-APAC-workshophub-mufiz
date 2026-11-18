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

<!-- TODO: Define which MCP servers (jira, github) may be used, and which tools are allowed, require confirmation, or are forbidden. -->

_To be defined._

## AGENT_BOUNDARY

<!-- TODO: Define what AI agents may and may not do in this repo (files off-limits, actions requiring human approval, etc.). -->

_To be defined._
