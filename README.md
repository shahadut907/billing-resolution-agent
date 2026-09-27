# Billing Resolution Agent

AI agent for investigating SaaS billing issues with evidence, human approval,
and audited actions.

**Milestone 1 (current state) is the data foundation and a read-only console.**
There is no AI diagnosis, no automated tooling, no approval actions, no payment
integrations, and no email sending in this milestone, by design.

## What Milestone 1 delivers

- A pnpm monorepo with a **Next.js** frontend, a **NestJS** API, and a
  **Prisma** schema targeting **PostgreSQL** (Docker intentionally not used).
- Synthetic records for one fictional SaaS company — **Lumina Metrics, Inc.** —
  covering accounts, subscriptions, payments, invoices, tickets, and policies.
  All names, email addresses (`.example` TLD), payment references, and amounts
  are invented.
- Four seeded ticket scenarios that later milestones will work against:

  | Reference | Scenario | What the persisted records show |
  | --- | --- | --- |
  | `TCK-1001` | Paid but inactive plan | A successful payment covering the current period while the subscription sits `CANCELED`. |
  | `TCK-1002` | Duplicate invoices with one charge | Two paid invoices that reference the same successful payment. |
  | `TCK-1003` | Reported cross-account exposure | The reporter's account is linked to a distinct related account via the ticket; the other account's financial records are deliberately not displayed. |
  | `TCK-1004` | Ambiguous possible double charge | Two similar charges two days apart, each mapped to its own invoice, so the data alone cannot confirm a duplicate. |

- Read-only API endpoints (`GET /api/health`, `GET /api/tickets`,
  `GET /api/tickets/:id`) and a responsive frontend (ticket list + detail) that
  renders the persisted ticket and its related records, including the company
  policy tagged for the scenario.
- An **idempotent seed command** (upserts on stable keys, safe to re-run),
  committed Prisma migrations, and tests covering dataset integrity, API
  behavior, and seed idempotency.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS read-only REST API (port 4000) |
| `apps/web` | Next.js App Router frontend (port 3000) |
| `packages/db` | Prisma schema, migrations, synthetic dataset, idempotent seed |
| `packages/types` | Shared API response types used by both apps |

## Prerequisites

- Node.js 20+ (24.x used during development)
- pnpm 10+ (`npm install -g pnpm` or `corepack enable`)
- A reachable **PostgreSQL 14+** instance — install one locally or point
  `DATABASE_URL` at any instance you control. No Docker, no cloud signup.

## Setup

```bash
pnpm install
cp .env.example .env   # then edit DATABASE_URL with your own local Postgres values
pnpm db:deploy         # apply the committed Prisma migrations
pnpm db:seed           # idempotent — safe to run again at any time
pnpm dev               # starts API (port 4000) and web (port 3000) together
```

Open http://localhost:3000 for the ticket list. `pnpm install` also builds every
workspace package (via a postinstall step), so `pnpm dev` works right away.

## Useful scripts (run from the repo root)

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the API and web dev servers together |
| `pnpm build` | Build every workspace package |
| `pnpm test` | Unit + dataset tests (no database required) |
| `pnpm test:e2e` | API end-to-end tests against a live database (auto-skips when the DB is unreachable) |
| `pnpm db:deploy` | Apply committed migrations (`prisma migrate deploy`) |
| `pnpm db:seed` | Idempotent seed |
| `pnpm db:migrate:dev` | Create a new migration after schema edits |
| `pnpm db:studio` | Prisma Studio |

Environment: the git-ignored `.env` at the repo root holds `DATABASE_URL`,
`API_PORT`, and `API_BASE_URL`. Copy `.env.example` and fill in your own values
— never commit real credentials.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness plus a database connectivity flag |
| `GET /api/tickets?status=OPEN\|IN_REVIEW\|RESOLVED` | Ticket list with account names, newest first |
| `GET /api/tickets/:id` | Ticket detail with the reporter account, related account (when linked), subscriptions, payments, invoices, and matching policies |

All endpoints are read-only on purpose. Milestone 1 only *persists and shows*
data; it does not diagnose, decide, or act.

## Tests

- `packages/db` — dataset integrity invariants (unique keys, cross-record
  references, one ticket per scenario, policy coverage), plus — when a database
  is reachable — an idempotency suite that seeds twice and asserts identical
  state.
- `apps/api` — unit tests for the ticket service/controller against a mocked
  Prisma client, and e2e tests (supertest) that boot the real app and exercise
  list/filter/detail/404 behavior against the seeded database. The e2e suite
  probes database availability first and reports itself as **skipped** (not
  passing) when no database is reachable.

## Roadmap

- **Milestone 1 (this state):** data model, seed, read-only API and console.
- **Later milestones (planned, not started):** investigation tooling, evidence
  gathering, and human-approved resolution drafts. Nothing beyond Milestone 1
  exists yet — this console deliberately makes no claims about agent behavior.
