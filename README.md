# SoftSocial — Phases 1 and 2

A multi-workspace content management tool for social media teams.

**Phase 1 is manual by design:** the app plans, assigns and tracks posts so a
human publishes them on Facebook and LinkedIn themselves.

**Phase 2 adds internal scheduling.** Each target can be given a date, a time, a
timezone and a reminder, and the app tracks what is due today, what is overdue and
what is coming up. Phase 2 does **not** change who publishes: scheduling decides
*when* a task is due, and a person still publishes it by hand. The app never calls
a social network API in either phase.

`master.txt` also specifies Phase 3 (real publishing through the Meta and LinkedIn
APIs). That is not implemented here, although the database schema already carries
the nullable columns it needs.

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

## Roles

| Capability                | Owner | Admin | Member |
| ------------------------- | :---: | :---: | :----: |
| Manage workspace settings |   ✓   |       |        |
| Manage team               |   ✓   |   ✓   |        |
| Manage profiles and posts |   ✓   |   ✓   |        |
| Schedule and move targets |   ✓   |   ✓   |        |
| Update any target         |   ✓   |   ✓   |        |
| Update own targets        |   ✓   |   ✓   |   ✓   |
| Comment                   |   ✓   |   ✓   |   ✓   |
| Read everything           |   ✓   |   ✓   |   ✓   |

The single source of truth is `src/lib/auth/permissions.ts`, and every Server
Action checks a permission through the data-access layer.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Tailwind CSS 4 + shadcn-style Radix UI components
- Prisma 7 with PostgreSQL, generated into `src/generated/prisma`
- Zod for every Server Action payload
- `jose` for the signed session cookie, scrypt for passwords
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
- `AUTH_SECRET` — 32 random bytes, e.g. `openssl rand -base64 32`.
- `STORAGE_PROVIDER` — `local` for development, `supabase` in production.

The `local` storage driver writes into `STORAGE_LOCAL_DIR` (default
`./storage`) and is **not** durable on serverless hosts. Use Supabase Storage
there.

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
```

Register an account, create a workspace, then add profiles, posts and targets.

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
| `npm run lint`          | ESLint                                  |
| `npm run typecheck`     | `tsc --noEmit`                           |
| `npm test`              | Vitest unit tests                        |
| `npm run test:coverage` | Vitest with coverage                     |
| `npm run verify`        | lint + typecheck + test + build          |
| `npm run db:create`     | Create the database if it is missing     |
| `npm run db:generate`   | Generate the Prisma client               |
| `npm run db:migrate`    | Create/apply a development migration     |
| `npm run db:deploy`     | Apply migrations (production)            |
| `npm run db:seed`       | Load the acceptance data                 |
| `npm run db:studio`     | Prisma Studio                            |

## Project layout

```
prisma/                 schema, migrations, seed wiring
scripts/                CLI scripts (create database, seed)
src/actions/            Server Actions, one module per domain
src/app/                routes; (auth) and (dashboard) route groups
src/components/         UI, grouped by feature
src/generated/prisma/   generated Prisma client (not hand-edited)
src/lib/auth/           password, session token, session cookie, DAL, permissions
src/lib/data/           workspace-scoped read queries
src/lib/storage/        local and Supabase media drivers
src/lib/validation/     Zod schemas
src/lib/scheduling.ts   timezone-safe date, range and reminder arithmetic
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
- Activity is recorded for every sensitive change.

## Deployment

`npm run build` produces a standalone server in `.next/standalone`. The included
`Dockerfile` builds that image and runs it as a non-root user. On a serverless
host, set `STORAGE_PROVIDER=supabase` — the local filesystem driver cannot
persist uploads.
#   s o f t s o c i a l  
 