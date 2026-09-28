# Billing Resolution Agent

An AI-assisted billing support workspace for one fictional SaaS company
(**Lumina Metrics, Inc.**). A support reviewer opens a synthetic billing ticket,
runs a **bounded, read-only AI investigation**, sees every record and tool call
behind the diagnosis, reviews a **proposed action and draft reply**, then
**approves, rejects, or escalates**. Only an authorized human decision can cause
a permitted change to the synthetic database — exactly once, with a durable
audit trail.

> Every record in this project is invented: names, `.example` email addresses,
> payment references, and amounts. "Actions" only ever mutate the local
> synthetic sandbox dataset — no Stripe, no email, no real customers.

## What is implemented

| Area | Status |
| --- | --- |
| Monorepo (pnpm): Next.js web, NestJS API, Prisma/PostgreSQL, shared types | ✅ working |
| Synthetic dataset: 6 accounts, 4 ticket scenarios, 4 policies, idempotent seed | ✅ working |
| Bounded, read-only AI investigation (mock + OpenAI-compatible providers) | ✅ working (mock verified; real provider unverified — no API key) |
| Immutable action proposals with server-side eligibility, version pinning, expiry | ✅ working |
| Reviewer-authenticated approve / reject / escalate with exactly-once apply | ✅ working (database-proven under concurrency) |
| Durable audit trail with before/after evidence | ✅ working |
| Three-panel glass workspace UI, mobile-stacked, reduced-motion/-transparency | ✅ working |
| Deterministic evaluation harness (16 cases, no API key needed) | ✅ passing — see [docs/evaluation-report.md](docs/evaluation-report.md) |
| Public read-only preview mode (`PUBLIC_READ_ONLY=1`) | ✅ implemented |
| Live public deployment | ❌ not deployed — no hosting account available; config + steps in [docs/deployment.md](docs/deployment.md) |

## The four demo journeys

| Reference | Scenario | Investigation says | What approval can do |
| --- | --- | --- | --- |
| `TCK-1001` | Paid but inactive plan | Successful payment covers a `CANCELED` subscription's period (CONFIRMED). | **Entitlement repair** — sets the subscription `ACTIVE` for the paid period, once, then the ticket resolves. |
| `TCK-1002` | Duplicate invoices, one charge | Two paid invoices reference the same successful charge (CONFIRMED). | **Duplicate-invoice correction** — voids only the later duplicate invoice; no refund, ever. |
| `TCK-1003` | Reported cross-account exposure | Urgent security escalation; the other account's records were never read. | **Escalation only** — no mutation proposal can exist, no false reassurance, no disclosure of the other account. |
| `TCK-1004` | Ambiguous possible double charge | Two similar charges each map to a distinct invoice; uncertainty preserved (`UNCERTAIN`). | **Escalation only** — routes to financial review; the system cannot invent a refund. |

## Architecture

```mermaid
flowchart LR
    subgraph browser["Browser"]
        W["Next.js workspace UI\n(three panels)"]
    end
    subgraph nextsrv["Next.js server"]
        P["/backend proxy rewrite"]
        S["Server components\n(server-side fetch)"]
    end
    subgraph api["NestJS API (private)"]
        T["Tickets API\n(read-only)"]
        I["Investigation runner\n+ scoped tools"]
        A["Proposals & decisions\n+ reviewer auth"]
        M["Audit trail"]
    end
    DB[("PostgreSQL\nsynthetic dataset")]
    P["Optional real model\n(OpenAI-compatible API)"]

    W -- same-origin /backend/* --> P --> T & I & A
    S -- server-side fetch --> T & I & A
    I -- "zero-arg, ticket-scoped\ntool allowlist" --> DB
    I -.-> P2
    A -- "locked transaction,\nexactly-once ledger" --> DB
    A --> M --> DB
    T & I & A --> DB
```

See [docs/architecture.md](docs/architecture.md) for the security boundaries:
tool scoping, verdict validation, prompt-injection containment, eligibility
rules, the two-phase approval transaction, and the exactly-once ledger.

## Running it locally (no Docker)

Requirements: Node ≥ 20, pnpm 12 (`corepack enable`), PostgreSQL 14+ running
locally. Everything runs on your machine — nothing else is needed.

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env
# then edit .env:
#   DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/billing_resolution?schema=public
#   REVIEWER_PASSCODE=choose-your-own-reviewer-secret   # decisions are disabled without it
#   (AI_PROVIDER=mock by default — no API key needed)

# 3. Create schema + seed (both idempotent / re-runnable)
pnpm db:deploy
pnpm db:seed

# 4a. Development
pnpm dev            # API on :4000, web on :3000

# 4b. Production-style local run
pnpm build
# start the API: cd apps/api && node dist/main.js   (with .env loaded)
# start the web: cd apps/web && node_modules/.bin/next start

# 5. Open http://localhost:3000
```

Starting PostgreSQL on this machine (if it is not running):
`sudo service postgresql start` (Debian/Ubuntu) or `brew services start
postgresql` (macOS). Never expose PostgreSQL on a public interface; the dev
setup here uses loopback-only trust auth, which is a development-only
convenience.

### Walking a full journey

1. Open `http://localhost:3000` and select **TCK-1001**.
2. Click **Run investigation** — the right panel shows the (mock-labeled)
   diagnosis, evidence with citations, contradicting evidence, and the redacted
   tool trace.
3. Click **Derive action proposal** — server-side code (not the model) decides
   eligibility and pins record versions, policy version, and expiry.
4. Enter a reviewer name + your `REVIEWER_PASSCODE`, click **Approve & apply** —
   the subscription flips to `ACTIVE` in the center panel, the ticket resolves,
   and the audit timeline records the decision and before/after evidence.
5. Try **TCK-1003**: deriving a proposal is refused (escalation-only), and the
   escalation form records a durable decision without touching any account.

## Testing

```bash
pnpm test           # unit tests (dataset integrity, agent loop, verdicts,
                    # eligibility engine, reviewer auth, mock provider)
pnpm test:e2e       # database-backed HTTP tests: tickets, investigations,
                    # and the 22-test approval gate suite (auth, expiry,
                    # policy change, record drift, wrong-account, concurrent
                    # duplicate approvals, rollback, all four scenarios)
pnpm eval           # deterministic 16-case evaluation; writes
                    # docs/evaluation-report.md (no API key required)
pnpm build          # builds all packages
```

The e2e suite needs a reachable PostgreSQL (same `DATABASE_URL`). Without one
it reports as **SKIPPED** — never as passing. The real-provider smoke test
(`apps/api/test/provider-smoke.e2e-spec.ts`) runs exactly one model call and
only when `AI_SMOKE_TEST=1`, `AI_PROVIDER=openai`, `AI_API_KEY`, and `AI_MODEL`
are all set; it is skipped otherwise.

## Mock vs real model

- `AI_PROVIDER=mock` (default): a deterministic rules-based provider drives the
  same protocol, validation, and persistence pipeline as a real model. Every
  such investigation is persisted with `provider="mock"`, `isMock=true`, and the
  UI labels it **MOCK · no AI model called**. It is never presented as a real
  model call.
- `AI_PROVIDER=openai` + `AI_API_KEY` + `AI_MODEL` (+ optional `AI_BASE_URL`):
  any OpenAI-compatible chat-completions API. Results are labeled **REAL MODEL
  · provider / model**. The key lives only in the API process; it is never sent
  to the browser or persisted.
- **Real-provider behavior is explicitly unverified in this repository's
  evaluation** — no inference API key was available when the evaluation report
  was generated. The harness, bounds, and validation paths are identical for
  both providers; only the text-generation step differs.

## Security boundaries (summary)

- **Tool scope is server-side and zero-argument.** The model can only request
  six allowlisted tools pre-scoped to one ticket's reporter account; any
  arguments (e.g. an attacker-supplied `accountId`) are rejected before a query
  runs. Ticket text is treated as data, not instructions.
- **Model text can never widen anything.** Citations are checked against
  gathered evidence; completed-action claims and related-account disclosures are
  rejected; policy overrides force URGENT/SECURITY_ESCALATION for exposure and
  UNCERTAIN/FINANCIAL_REVIEW for ambiguous charges after the model answers.
- **The model cannot create proposals.** Server-side code derives them from the
  live records and refuses anything except entitlement repair and duplicate-
  invoice correction on matching scenarios. Exposure and ambiguous-charge routes
  are structurally escalation-only.
- **Only an authenticated reviewer can cause a change.** Decisions require the
  `REVIEWER_PASSCODE` (constant-time compared; no default — unset means the
  decision endpoints answer `503` and the workflow is off).
- **Exactly once.** Approval re-validates expiry, record versions, policy
  version, and account ownership inside one row-locked transaction; an
  `AppliedAction` ledger with a `(ticket, actionType)` unique constraint makes a
  second application a database-level impossibility. Any in-transaction failure
  rolls everything back — the ticket is not resolved — and is recorded as a
  failed apply attempt.
- **Public previews are read-only.** `PUBLIC_READ_ONLY=1` makes every mutating
  endpoint answer `403`, so shared demos cannot mutate the dataset or trigger
  paid AI usage. The browser never talks to the API cross-origin (same-origin
  `/backend` proxy) and never sees provider credentials.

Full details: [docs/architecture.md](docs/architecture.md).

## Project layout

```
apps/web        Next.js workspace (three-panel UI, glass theme)
apps/api        NestJS API (tickets, investigations, proposals, meta)
packages/db     Prisma schema, migrations, idempotent seed + dataset
packages/types  Shared API contract types
docs/           Architecture, evaluation report, deployment guide
```

## Environment variables (names only — never commit values)

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | db, api | PostgreSQL connection string |
| `API_PORT` | api | API listen port (default 4000) |
| `API_BASE_URL` | web, scripts | Base URL the web server uses to reach the API |
| `AI_PROVIDER` | api | `mock` (default) or `openai` |
| `AI_API_KEY` | api | Provider key — stays in the API process |
| `AI_MODEL` | api | Model id for the real provider |
| `AI_BASE_URL` | api | Optional OpenAI-compatible base URL |
| `AGENT_TIME_BUDGET_MS` | api | Wall-clock investigation budget (default 20000) |
| `AGENT_MAX_TOOL_CALLS` | api | Tool-call budget (default 12) |
| `REVIEWER_PASSCODE` | api | Reviewer secret; unset = decisions disabled |
| `ACTION_PROPOSAL_TTL_MINUTES` | api | Proposal expiry (default 30) |
| `PUBLIC_READ_ONLY` | api | `1` = public read-only preview (all mutations 403) |

## Deployment

Deployment-ready configuration and the exact remaining human steps (free-tier
Postgres + web hosts, verified notes on current free-tier terms) are in
[docs/deployment.md](docs/deployment.md). Nothing has been deployed from this
repository — no hosting accounts exist in this environment.

## Limitations (honest list)

- One shared synthetic dataset: the demo is not multi-tenant. Public previews
  must run with `PUBLIC_READ_ONLY=1`; per-visitor sandbox isolation is future
  work.
- Real-provider behavior is unverified (no API key was available); the mock
  provider exercises everything except the actual text generation.
- "Entitlement repair" and "duplicate-invoice correction" only mutate the
  synthetic tables described above — no payment processor, email, or external
  system exists here.
- Reviewer identity is a shared passcode + display name, appropriate for a demo
  but not a substitute for real SSO in production.
