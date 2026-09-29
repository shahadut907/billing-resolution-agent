# Deployment guide

Status: **deployment-ready, not deployed.** No hosting account, billing
profile, or managed database exists in the environment this repository was
built in, so no live URL is claimed. Everything below is the exact remaining
work a human with an account needs to do (≈15 minutes, no credit card).

The public deployment must run with `PUBLIC_READ_ONLY=1`: one shared synthetic
dataset cannot be mutated by visitors. The full approval journey runs locally
(see README → "Walking a full journey").

> Free-tier terms summarized below were checked from public sources in
> September 2026 and can change — verify on the provider's official pricing
> page before signing up.

## Recommended free-tier layout

| Piece | Host (free tier) | Notes |
| --- | --- | --- |
| PostgreSQL | [Neon](https://neon.com/pricing) free plan | ~0.5 GB storage, ~100 compute-hours/month, scale-to-zero — far more than this demo needs (dataset is a few KB). |
| Web + API | [Render](https://render.com/pricing) free web services | Free services spin down after ~15 min idle; first request afterwards has a ~30–60 s cold start. Two services (web + api) fit the free tier. |

Alternatives that also work with the configs below: Fly.io, Railway, Koyeb,
Supabase (Postgres). Anything that runs a Node 20 process and exposes
`DATABASE_URL` works — **no Docker images are required by this repo**.

## Steps (human, with account access)

### Keeping the database URL out of shell history

The migration/seed/demo-setup commands below read the database URL from
`.env.remote` — a git-ignored file — instead of a shell variable, so the
secret never lands in command history, terminal scrollback, or logs:

1. In the repository root, create `.env.remote` with a text editor (NOT
   `echo`) containing a single line:

   ```
   DATABASE_URL=postgresql://…your-neon-connection-string…
   ```

2. `.gitignore` already excludes `.env.*`; confirm with
   `git check-ignore .env.remote`. Never commit this file, never paste its
   value into a shell command or a screenshot.
3. Run the commands in step 3 — they pick the URL up from that file.
4. When done, you can keep the file for re-runs (idempotent) or delete it:
   `rm .env.remote` — or `shred -u .env.remote` to overwrite before removal.

### Fast path: Render Blueprint (recommended)

The repository ships a [`render.yaml`](../render.yaml) Blueprint that defines
both services with the public-demo configuration fixed (mock provider,
`PUBLIC_READ_ONLY=1`, no reviewer passcode, health check on `/api/health`):

1. Create the Neon database (step 1 below) and put its connection string into
   `.env.remote` as described above.
2. Sign in at render.com **with GitHub** → dashboard → **New +** →
   **Blueprint** → select this repository → **Apply**.
3. Render prompts for two values (they are marked `sync: false` in the
   blueprint):
   - `DATABASE_URL` → paste the Neon connection string.
   - `API_BASE_URL` → leave blank for now; it needs the URL Render actually
     assigns to the API service (step 4).
4. After the services deploy: open the **billing-resolution-api** service
   page and copy the URL Render assigned it from the header (for a free
   service it looks like `https://<random-or-name>.onrender.com`) — do not
   assume it from the service name. Set the **web** service's
   `API_BASE_URL` environment variable to that URL with `/api` appended
   (Environment tab → Save) — the web service redeploys.
5. Run migrations + seed + demo investigations against Neon (step 3 below) —
   the schema is empty until you do.
6. Verify (step 6 below): the workspace shows each ticket with its persisted
   MOCK investigation; mutations return `403`.

### Manual path (what the blueprint automates)

### 1. Create the Neon database

1. Sign up at neon.com → create a project.
2. Copy the connection string → this is `DATABASE_URL`
   (`postgresql://USER:PASSWORD@HOST/DB?sslmode=require`).
3. The database starts empty; migrations create the schema (step 3).

### 2. Push the repository to GitHub

This repo's commits are local until authenticated:

```bash
git push origin main     # from an authenticated terminal
```

### 3. Create the schema, seed, and demo investigations

With `.env.remote` in place (see "Keeping the database URL out of shell
history" above), run:

```bash
pnpm db:deploy:remote     # applies Prisma migrations
pnpm db:seed:remote       # seeds the synthetic dataset (idempotent)
pnpm demo:setup:remote    # runs the bounded MOCK investigation pipeline for all four tickets (idempotent)
```

All three are idempotent — re-running is safe. The demo-investigation step
runs the existing agent pipeline end to end (mock provider → scoped tools →
validation → policy overrides → persistence) and labels every result
`provider="mock"` / `isMock=true`. It never calls a real model.

### 4. Create the API service on Render

- New Web Service → connect the GitHub repo.
- Runtime: Node · Build: `corepack enable && pnpm install --frozen-lockfile`
  · Start: `node apps/api/dist/main.js` (binds Render's injected `PORT`).
- Environment:
  - `DATABASE_URL` = Neon connection string (**secret**, never in code)
  - `NODE_VERSION` = `20`
  - `AI_PROVIDER` = `mock`
  - `PUBLIC_READ_ONLY` = `1` ← **required for a public demo**
  - Do **not** set `REVIEWER_PASSCODE` on the public service; decisions are
    then structurally disabled (503), not merely hidden.
- Health check path: `/api/health`.

### 5. Create the web service on Render

- New Web Service → same repo.
- Runtime: Node · Build: `corepack enable && pnpm install --frozen-lockfile`
  · Start: `node apps/web/node_modules/.bin/next start -p $PORT` (run from
  repo root).
- Environment:
  - `API_BASE_URL` = the URL Render actually assigned to the API service
    (copy it from the api service's page) with `/api` appended — e.g.
    `https://<assigned-host>.onrender.com/api`. Do not guess it.
  - `NODE_ENV` = `production`
- The `/backend/*` rewrite proxies browser traffic through the web server, so
  the browser only ever talks same-origin.

### 6. Verify

- `https://<web-host>/` renders the workspace; every ticket shows a
  persisted investigation labeled **MOCK · no AI model called** with cited
  evidence and a redacted tool trace.
- `https://<api-host>/api/health` → `{"status":"ok","database":true}`.
- `https://<api-host>/api/meta` → `publicReadOnly:true`,
  `reviewerAuthConfigured:false`, `aiProvider:"mock"`.
- Attempting `POST /api/tickets/:id/investigation` on the public API returns
  `403 public_read_only`.

## What is deliberately NOT deployed

- A reviewer passcode: approvals stay a local exercise. The dataset is shared;
  letting the public approve changes would break the demo for everyone.
- A real provider key: public visitors must not be able to trigger uncontrolled
  paid AI usage. The mock provider is free and labeled honestly.
- Per-visitor sandbox isolation (fresh seeded dataset per visitor with bounded
  reset) is the future-work path to a fully interactive public demo.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request
on GitHub-hosted runners (free for public repositories): install, build all
packages, unit tests, the database-backed e2e suite (including the 22-test
approval gate) against a Postgres service container, and the deterministic
evaluation harness. It never needs Docker on your machine and never touches
secrets — no API keys exist in the repo.
