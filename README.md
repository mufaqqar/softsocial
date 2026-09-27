# SoftSocial — Phases 1, 2 and 3

A multi-workspace content management tool for social media teams.

**Phase 1 is manual by design:** the app plans, assigns and tracks posts so a
human publishes them on Facebook and LinkedIn themselves.

**Phase 2 adds internal scheduling.** Each target can be given a date, a time, a
timezone and a reminder, and the app tracks what is due today, what is overdue and
what is coming up. Phase 2 does **not** change who publishes: scheduling decides
*when* a task is due, and a person still publishes it by hand.

**Phase 3 adds real publishing** through the Meta and LinkedIn APIs, per
`master.txt` section 3. A connected Facebook Page or LinkedIn organisation is
published to automatically by a standalone worker, with retries, idempotency and
per-attempt history. Manual publishing still works unchanged, so a workspace can
run both at once.

## What Phase 1 does

- Email/password accounts with revocable server-side sessions.
- Workspaces, with per-workspace roles: **Owner**, **Admin**, **Member**.
- Manual records of Facebook pages and LinkedIn pages, grouped by platform.
- Posts with per-platform copy, hashtags, internal notes and media.
- Selecting profiles to publish a post to, which creates one **target** per
  profile with its own status and notes.
- Assignment: a post or a single target can be assigned to a team member.
- **My Tasks** — the assignee copies the copy, publishes it by hand, and marks
  each target complete.
- Comments on posts, an activity log, and notifications.
- Media uploads streamed through an authorized route.

## What Phase 2 adds

- **Per-target schedules.** Every target carries its own date, time, IANA
  timezone and optional reminder. One post can go out on Facebook on Monday and on
  LinkedIn the following Thursday.
- **Calendar** (`/dashboard/calendar`) in Month, Week, Day and Agenda views, with
  drag and drop between days.
- **Tasks** (`/dashboard/tasks`) — everything due on a chosen day, anything still
  waiting to be scheduled, and anything already overdue.
- **Reminders** that turn into in-app notifications.
- **Derived statuses.** A target that is still `PENDING` past its slot reads as
  `OVERDUE`; a post whose outstanding targets are all in the future reads as
  `SCHEDULED`. Neither is a status you set by hand, and neither is written to the
  database.
- **Filtering** by assignee, platform, profile and status, held in the URL so a
  view can be linked to and survives a refresh.

### Timezones

A schedule is stored as a wall date, a wall time and the timezone it was typed in,
plus the instant those three resolve to. That distinction matters because an offset
is not a zone: `+05:00` has no daylight saving, so a schedule pinned to one would
drift by an hour twice a year. Only names like `Asia/Karachi` and `UTC` are
accepted, and an impossible date such as `2026-02-30` is rejected rather than
quietly rolled over.

The workspace timezone is what every grid and list is drawn in, so a view is
internally consistent. A row also carries the wall time it was typed in, which is
what the schedule dialog opens with — editing a task never silently shifts it to a
neighbouring day.

### Reminders

A reminder fires the next time a dashboard page is rendered and the moment it was
set for has passed. There is no background worker in this phase, so a reminder
cannot fire while the app is closed; it is delivered the next time the assignee
opens SoftSocial. Delivery is idempotent, so navigating around does not produce
duplicate notifications.

## What Phase 3 adds

- **Connections** (`/dashboard/connections`) — connect a Facebook Page or a
  LinkedIn organisation over OAuth. The app stores only the long-lived token,
  encrypted; short-lived Page and member credentials are re-derived per attempt.
- **Automatic publishing.** A target on a connected profile is published by the
  worker at its scheduled time. `src/lib/publishing/dispatch.ts` is the single
  entry point, so the pipeline never branches on platform itself.
- **A standalone worker** (`npm run worker`) consuming a BullMQ queue on Redis.
  It is deliberately a separate process: a serverless function cannot hold a
  Redis connection open, and a publish must survive the request that scheduled it.
- **Retries with the right split.** A transient failure (rate limit, timeout, 5xx)
  is retried on a 30s / 2m / 10m backoff. A permanent failure (revoked token,
  missing permission, deleted Page) is recorded and left for a human, because
  retrying only reproduces the rejection.
- **Idempotency.** A job is claimed with a conditional update, so two workers
  racing on one target produce exactly one publish, and a worker that crashed
  after the provider accepted the post does not publish again.
- **Publish history and API status** (`/dashboard/publishing`) — one row per
  attempt, including the failures and why, plus a per-provider report of what is
  configured. Retrying re-arms a single profile.
- **Encrypted tokens at rest** (AES-256-GCM), so a row edited directly in the
  database cannot be swapped for an attacker-controlled value.

Phase 3 stays inert until `ENCRYPTION_KEY`, `REDIS_URL` and the Meta/LinkedIn
credentials are set. Missing values are reported by the connections and publishing
pages rather than crashing the app, and nothing is validated at import time, so a
build never fails for want of a production secret.

## Roles

| Capability                    | Owner | Admin | Member |
| ----------------------------- | :---: | :---: | :----: |
| Manage workspace settings     |   ✓   |       |        |
| Manage team                   |   ✓   |   ✓   |        |
| Manage profiles and posts     |   ✓   |   ✓   |        |
| Schedule and move targets     |   ✓   |   ✓   |        |
| Update any target             |   ✓   |   ✓   |        |
| Update own targets            |   ✓   |   ✓   |   ✓   |
| Comment                       |   ✓   |   ✓   |   ✓   |
| Read everything               |   ✓   |   ✓   |   ✓   |
| Connect or reconnect an account |  ✓   |   ✓   |        |
| Force a publish or a retry    |   ✓   |   ✓   |        |
| Read connections and publish history |  ✓   |  ✓   |   ✓   |

The single source of truth is `src/lib/auth/permissions.ts`, and every Server
Action checks a permission through the data-access layer.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Tailwind CSS 4 + shadcn-style Radix UI components
- Prisma 7 with PostgreSQL, generated into `src/generated/prisma`
- Zod for every Server Action payload
- `jose` for the signed session cookie, scrypt for passwords
- BullMQ on Redis (via `ioredis`) for the publish queue
- Vitest for unit tests

## Getting started

### 1. PostgreSQL

Either use an existing PostgreSQL server, or start the bundled one:

```bash
docker compose up -d db
```

### 2. Environment

```bash
cp .env.example .env
```

Set at minimum:

- `DATABASE_URL` / `DIRECT_URL` — PostgreSQL connection strings.
- `AUTH_SECRET` — 32 random bytes, e.g. `openssl rand -base64 32`. Only presence
  is checked, so a placeholder would be accepted and every session cookie would be
  forgeable.
- `STORAGE_PROVIDER` — `local` for development, `supabase` in production.

The `local` storage driver writes into `STORAGE_LOCAL_DIR` (default
`./storage`) and is **not** durable on serverless hosts. Use Supabase Storage
there.

For Phase 3 also set `APP_URL`, `ENCRYPTION_KEY` (32 random bytes),
`REDIS_URL` and the Meta/LinkedIn credentials. Phases 1 and 2 need none of them.

### 3. Database

```bash
npm run db:create      # only if the database does not exist yet
npm run db:generate    # regenerate the Prisma client after schema changes
npm run db:migrate     # apply migrations
npm run db:seed        # optional: the Phase 1 acceptance data
```

### 4. Run

```bash
npm run dev            # http://localhost:3000
npm run worker         # optional: only needed for Phase 3 publishing
```

Register an account, create a workspace, then add profiles, posts and targets.

The worker is a second process and needs its own terminal, a reachable Redis, and
`ENCRYPTION_KEY` set. Without it the app runs normally and simply queues nothing
that gets published.

### Seeded accounts

`npm run db:seed` reproduces the acceptance test in `master.txt` section 20:
the workspace **IT Eksperts**, members **Ahmed**, **Ali** and **Sara**, six
social profiles, and the post **AI Chatbot Promotion** with four targets, three
of them already completed. All seeded accounts share the password
`Softsocial123`:

| Role   | Email                   |
| ------ | ----------------------- |
| OWNER  | mufaqar@softsocial.dev  |
| ADMIN  | ali@softsocial.dev      |
| MEMBER | ahmed@softsocial.dev    |
| MEMBER | sara@softsocial.dev     |

The seed is idempotent, so it can be re-run safely.

## Scripts

| Script                  | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Development server                       |
| `npm run build`         | Production build                         |
| `npm run start`         | Serve the production build               |
| `npm run worker`        | Publish worker (Phase 3, separate process) |
| `npm run worker:watch`  | Publish worker, restarting on change     |
| `npm run lint`          | ESLint                                  |
| `npm run typecheck`     | `tsc --noEmit` via `tsconfig.typecheck.json` |
| `npm test`              | Vitest unit tests                        |
| `npm run test:coverage` | Vitest with coverage                     |
| `npm run verify`        | lint + typecheck + test + build          |
| `npm run db:create`     | Create the database if it is missing     |
| `npm run db:generate`   | Generate the Prisma client               |
| `npm run db:migrate`    | Create/apply a development migration     |
| `npm run db:deploy`     | Apply migrations (production)            |
| `npm run db:seed`       | Load the acceptance data                 |
| `npm run db:studio`     | Prisma Studio                            |

`typecheck` deliberately runs through `tsconfig.typecheck.json` rather than
`tsconfig.json`. Next 16 writes generated route types to `.next/types` during a
build and `.next/dev/types` during `next dev`, and both files declare the same
global `PageProps` / `LayoutProps` / `RouteContext`. Next's own type check filters
`.next/dev/types` out (`next/dist/lib/typescript/runTypeCheck.js`); the
typecheck config does the same, so a running dev server cannot change the result,
and it keeps its own build info so it never collides with the one `next build`
uses.

## Project layout

```
prisma/                 schema, migrations, seed wiring
scripts/                CLI scripts (create database, seed)
src/actions/            Server Actions, one module per domain
src/app/                routes; (auth) and (dashboard) route groups
src/components/         UI, grouped by feature
src/generated/prisma/   generated Prisma client (not hand-edited)
src/lib/auth/           password, session token, session cookie, DAL, permissions
src/lib/crypto/         AES-256-GCM encryption for provider tokens
src/lib/data/           workspace-scoped read queries
src/lib/publishing/     OAuth, provider clients, dispatch, retry and status rules
src/lib/queue/          BullMQ queue name, Redis config, job payload
src/lib/storage/        local and Supabase media drivers
src/lib/validation/     Zod schemas
src/lib/scheduling.ts   timezone-safe date, range and reminder arithmetic
src/worker/             standalone BullMQ worker (publish pipeline)
proxy.ts                cookie-presence redirects only
```

## Notes for this phase

- Scheduling lives on `PostTarget`, never on `Post`. The columns
  (`scheduledAt`, `timezone`, `reminderAt`) already existed and are nullable, so
  Phase 2 needed no migration.
- `OVERDUE` and the post-level `SCHEDULED` are computed when rows are read, so a
  schedule left behind by a year still reads correctly without a nightly job.
- Every schedule query is scoped by `workspaceId` in `src/lib/data/schedule.ts`,
  and every schedule Server Action re-checks that the target belongs to the
  caller's workspace before writing.

## Security notes

- `src/proxy.ts` only checks whether a session cookie exists. Every page and
  action authorises through `src/lib/auth/dal.ts`, which verifies the signed
  cookie **and** the session row, then confirms workspace membership.
- All queries are scoped by `workspaceId`; nothing trusts an id from the client
  without also matching it to the caller's workspace.
- Media bytes are served by `/api/media/[id]`, which repeats the membership
  check, so a storage key cannot be used to read another workspace's files.
- Passwords are stored as `scrypt$salt$hash` and compared in constant time.
- Provider tokens are encrypted at rest with AES-256-GCM, so a token edited
  directly in the database cannot be swapped without the auth tag failing.
- Only the long-lived OAuth token is persisted. Page and organisation
  credentials expire in about an hour and are re-derived per attempt.
- The queue payload carries identifiers only, so no token, post body or image URL
  outlives the job that owns it in Redis.
- Publishing is claimed with a conditional update, so a target cannot be published
  twice by two workers, and a crash after the provider accepted a post does not
  cause a second one.
- Connecting an account and forcing a publish are separate permissions from merely
  reading that a connection needs attention, because both put content on a public
  page.
- Activity is recorded for every sensitive change.

## Deployment

`npm run build` produces a standalone server in `.next/standalone`. The included
`Dockerfile` builds that image and runs it as a non-root user. On a serverless
host, set `STORAGE_PROVIDER=supabase` — the local filesystem driver cannot
persist uploads.

Phase 3 needs a second long-running process, the worker, sharing the same
`DATABASE_URL` and `REDIS_URL` as the web app. It is not part of `next build` and
is not started by the web image.
