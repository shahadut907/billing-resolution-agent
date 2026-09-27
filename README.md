# Billing Resolution Agent

AI agent for investigating SaaS billing issues with evidence, human approval,
and audited actions.

**Current state: Milestones 1–2.** M1 is the data foundation and read-only
console; M2 adds a **bounded, read-only AI investigation agent**. There is still
no approval workflow, no account mutation, no refunds, and no email sending —
investigations are advisory drafts persisted for human review, by design.

## What Milestone 1 delivered

- A pnpm monorepo with a **Next.js** frontend, a **NestJS** API, and a
  **Prisma** schema targeting **PostgreSQL** (Docker intentionally not used).
- Synthetic records for one fictional SaaS company — **Lumina Metrics, Inc.** —
  covering accounts, subscriptions, payments, invoices, tickets, and policies.
  All names, email addresses (`.example` TLD), payment references, and amounts
  are invented.
- Four seeded ticket scenarios that later milestones work against:

  | Reference | Scenario | What the persisted records show |
  | --- | --- | --- |
  | `TCK-1001` | Paid but inactive plan | A successful payment covering the current period while the subscription sits `CANCELED`. |
  | `TCK-1002` | Duplicate invoices with one charge | Two paid invoices that reference the same successful payment. |
  | `TCK-1003` | Reported cross-account exposure | The reporter's account is linked to a distinct related account via the ticket; the other account's records are deliberately not retrieved. |
  | `TCK-1004` | Ambiguous possible double charge | Two similar charges two days apart, each mapped to its own invoice, so the data alone cannot confirm a duplicate. |

- Read-only API endpoints and a responsive frontend (ticket list + detail) that
  render the persisted ticket and its related records.
- An **idempotent seed command** (upserts on stable keys, safe to re-run),
  committed Prisma migrations, and tests covering dataset integrity, API
  behavior, and seed idempotency.

## What Milestone 2 added

A bounded, read-only investigation agent (`POST /api/tickets/:id/investigation`):

- **Hard scope enforcement in backend tools.** The model can request only six
  zero-argument tools (`get_ticket`, `get_account`, `list_subscriptions`,
  `list_payments`, `list_invoices`, `list_policies`), each pre-scoped server-side
  to the investigated ticket's reporter account. There is no tool that can reach
  another account's records, whatever the ticket text or the model requests;
  arguments and unknown tools are rejected (and the rejection is traced).
  For cross-account exposure reports the related account's records are never
  retrieved, and its name/email may not appear in the generated output.
- **Provider adapter with a configurable model/key.** `AI_PROVIDER=mock`
  (default) runs a deterministic, clearly labeled mock — `isMock: true` is
  persisted and shown in the UI ("no AI model was called"). `AI_PROVIDER=openai`
  uses any OpenAI-compatible chat-completions API (`AI_API_KEY`, `AI_MODEL`,
  optional `AI_BASE_URL`). The key stays in the API process: never in responses,
  logs, or Git; provider errors are sanitized.
- **Bounds.** Elapsed time (`AGENT_TIME_BUDGET_MS`, default 20s), tool calls
  (`AGENT_MAX_TOOL_CALLS`, default 12), loop turns, provider retries (2), and
  output-validation retries (2). Exceeding any bound fails the investigation
  with a recorded reason — nothing hangs or runs away.
- **Structured output validation.** The model's verdict (diagnosis, supporting
  and contradicting evidence with citations, uncertainty, risk category,
  proposed next step, draft reply) is validated against a fixed schema, and
  **every cited record ID is verified against the evidence the tools actually
  returned**. Unverifiable citations fail the investigation.
- **Server-side policy overrides (the model cannot talk its way out):**
  cross-account exposure is always forced to `URGENT` risk + `SECURITY_ESCALATION`
  next step; ambiguous possible-double-charge reports are forced to `UNCERTAIN`
  + `FINANCIAL_REVIEW`. Outputs claiming a refund, reactivation, or repair are
  rejected (pattern scan) and retried, then failed honestly.
- **Persistence for review.** Every run (success or failure) is stored with its
  redacted tool trace (tool, argument keys only, row counts, record ids,
  durations — no record payloads) and the applied overrides; the frontend shows
  the latest investigation on the ticket detail page.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS REST API (port 4000): read-only ticket endpoints + investigation agent |
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

Open http://localhost:3000 for the ticket list; each ticket detail page has an
"AI investigation" panel (mock mode unless you configure a real provider).

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
`API_PORT`, `API_BASE_URL`, and the AI provider settings (`AI_PROVIDER`,
`AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY`). Copy `.env.example` and fill in your
own values — never commit real credentials or API keys.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness plus a database connectivity flag |
| `GET /api/tickets?status=OPEN\|IN_REVIEW\|RESOLVED` | Ticket list with account names, newest first |
| `GET /api/tickets/:id` | Ticket detail with the reporter account, related account (when linked), subscriptions, payments, invoices, and matching policies |
| `POST /api/tickets/:id/investigation` | Run one bounded, read-only AI investigation; persists and returns it |
| `GET /api/tickets/:id/investigation` | Latest persisted investigation for the ticket (or `null`) |

All endpoints are read-only with respect to billing data. Investigations are
advisory drafts for human review — nothing is executed, refunded, repaired, or
sent.

## Tests

Three clearly separated layers:

- **Deterministic mock provider** (shipped, default): the e2e suite runs all
  four seeded scenarios end to end, checks persistence and the redacted trace,
  and asserts the exposure case never discloses the related account and the
  ambiguous case stays `UNCERTAIN`/financial-review. Persisted as
  `isMock: true` — never presented as a real model call.
- **Test-only fake provider** (unit): scriptable turns cover wrong-account tool
  access (rejected before any query), prompt injection in ticket text (unknown
  tools and scope-widening arguments rejected; output citations still verified),
  malformed model output (bounded retries → `invalid_output`), provider failure
  (bounded retries, sanitized error), and time/tool/loop budget exhaustion.
- **Real provider smoke test** (strictly opt-in): `provider-smoke.e2e-spec.ts`
  runs one real model call only when `AI_SMOKE_TEST=1`, `AI_PROVIDER=openai`,
  `AI_API_KEY`, and `AI_MODEL` are set; otherwise it reports as *skipped* and
  no real call happens anywhere in the suite.
- `packages/db` additionally covers dataset integrity invariants and — when a
  database is reachable — seed idempotency (seeds twice, asserts identical
  state).

## Roadmap

- **Milestone 1:** data model, seed, read-only API and console. ✅
- **Milestone 2:** bounded, read-only AI investigations with scoped tools,
  validated structured output, policy overrides, and persisted review records. ✅
- **Later milestones (planned, not started):** human approval workflow, audited
  actions, notifications. Nothing beyond M2 exists yet — this console makes no
  claims about executing resolutions.
