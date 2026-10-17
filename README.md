# Outpass

Campus gate and outpass app for colleges, hostels and schools.

- **Students** request an outpass and show a live QR code at the gate.
- **Parents** approve or reject their child's requests.
- **Wardens** give final approval. They can override a parent who hasn't
  responded, with a logged reason, and see who is out or overdue.
- **Guards** scan passes, check the face against the ID, record exits and
  entries (queued offline if the network drops), and register walk-in visitors.
- **Hosts** (faculty, wardens, students) invite visitors and approve walk-ins.
- **Admins** create staff accounts and link parents to students.

Stack: an **Expo (managed) React Native** app, a **Node + TypeScript
(Fastify)** API, and **Postgres** via **Prisma**. Deployable to **Dokploy**.

## Layout

```
apps/api       Fastify + Prisma API (Dockerized)
apps/mobile    Expo Router app (React Native — ships via EAS, not Dokploy)
apps/web       Website: landing page at / and the web build of the app at /app (nginx, Dockerized)
packages/shared  zod schemas + types shared by both
docker-compose.yml  local Postgres + API
```

## Prerequisites

- **Node 22+**
- **pnpm** (`corepack enable pnpm`)
- **Docker** (for local Postgres, and for building the API image)

## Local development

```bash
pnpm install

# 1. Environment (one file per app — Prisma and Expo each read their own)
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# 2. Database
docker compose up -d db

# 3. Apply migrations + generate the Prisma client
pnpm --filter @outpassed/api db:deploy
pnpm --filter @outpassed/api db:generate

# 4. API (http://localhost:3000)
pnpm dev:api

# 5. Mobile (in a second terminal)
pnpm dev:mobile
```

Point the app at the API:

- iOS simulator / web: `EXPO_PUBLIC_API_URL=http://localhost:3000`
- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`
- Physical device: use your machine's LAN IP, e.g. `http://192.168.1.20:3000`

### Where `EXPO_PUBLIC_API_URL` goes

It is a **mobile-app build variable** — it does *not* belong in Dokploy (the
backend and the static web page don't use it).

- **Local development:** `apps/mobile/.env` (copy from `apps/mobile/.env.example`).
- **Release builds:** the `env` blocks in `apps/mobile/eas.json`. The `preview`
  and `production` profiles are already set to
  `https://api.outpassed.studentalumni.ai`, so EAS-built binaries call
  production automatically.

Only variables prefixed with `EXPO_PUBLIC_` are embedded in the app bundle.

### Demo data

```bash
pnpm --filter @outpassed/api db:seed
```

This creates one account per role, all with the password `outpass-demo-123`:
`student@outpass.dev`, `parent@outpass.dev`, `warden@outpass.dev`, `guard@outpass.dev`
and `admin@outpass.dev`, plus two more students (`karthik@`, `priya@`).
It also creates passes in a few states: pending, approved, and out/overdue.
Re-running it resets the demo activity.

## How it works

**Outpass states**

```
PENDING_PARENT ──parent approves──▶ PENDING_WARDEN ──warden approves──▶ APPROVED
      │                                                                  │ exit scan
      └─ warden override (reason required) ──────────────────────────────┤
                                                                         ▼
   REJECTED · CANCELLED (student, before leaving)           OUT ──entry scan──▶ RETURNED
```

- Parent approval is skipped when no parent is linked.
- For students aged 18+ it is also skipped when `ADULT_PARENT_MODE=notify_only`.
- "Overdue" is computed: the pass is `OUT` and the time is past `returnBy`.
- A student can have one active pass at a time.

**Gate QR codes**

- Codes are HMAC-signed tokens, `v1.<payload>.<signature>`, that expire after
  `QR_TTL_SECONDS` (default 45 s). The app refreshes them before then, so a
  forwarded screenshot stops working.
- `POST /gate/scan` only verifies: it returns a verdict and changes nothing.
- Status changes when the guard confirms with `POST /gate/events`. Each event
  carries a client-generated id, so the offline queue can retry safely.
- Status updates are conditional, so double scans and parallel approvals
  can't both win.

**App structure (MVVM)**

- Screens live in `apps/mobile/app/` (Expo Router). Each role has its own tab
  group: `student`, `parent`, `warden`, `guard` and `admin`.
- Each screen gets its state and actions from a viewmodel hook in
  `src/features/*`.
- Shared UI is in `src/ui` and `src/components`, and design tokens are in
  `src/theme/tokens.ts`. The palette is white, gold and indigo, with Sora and
  Manrope type.

## API

All routes except auth and health need a `Bearer` token. Roles are enforced
on the server.

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | — | Student or parent sign-up |
| `POST` | `/auth/login` | — | Log in, return JWT |
| `GET` | `/auth/me` | any | Current user, with student profile |
| `GET` | `/outpasses?scope=all\|actionable` | student, parent, warden, admin | Passes the caller can see; `actionable` returns the ones waiting on them |
| `POST` | `/outpasses` | student | Request a pass |
| `GET` | `/outpasses/:id` | as above | One pass, with its approvals |
| `POST` | `/outpasses/:id/decision` | parent, warden, admin | Approve or reject (an override needs a `reason`) |
| `POST` | `/outpasses/:id/cancel` | student | Cancel before leaving |
| `GET` | `/outpasses/:id/qr` | student | Fresh gate QR token |
| `POST` | `/gate/scan` | guard, admin | Verify a QR (read-only verdict) |
| `GET` | `/gate/lookup?rollNo=` | guard, admin | Active pass by roll number |
| `POST` | `/gate/events` | guard, admin | Record an exit or entry (idempotent on `eventId`) |
| `GET` | `/gate/events` | guard, warden, admin | Recent movements |
| `GET` | `/visits?scope=all\|pending\|onsite` | any | Visits the caller hosts (staff see all) |
| `POST` | `/visits` | student, warden, admin | Invite a visitor (pre-approved) |
| `POST` | `/visits/walk-in` | guard, admin | Register a walk-in for host approval |
| `POST` | `/visits/:id/decision` | host | Approve or decline a walk-in |
| `GET` | `/visits/:id/qr` | host | Visitor pass token |
| `GET` | `/visits/hosts?q=` | any | People a visitor can ask for |
| `GET` | `/dashboard/summary` | warden, admin | Out now, overdue, pending, visitors, movements |
| `POST` | `/admin/users` | admin | Create a warden, guard or admin |
| `GET` | `/admin/users?role=` | admin | List accounts |
| `POST` | `/admin/guardianships` | admin | Link a parent (by email) to a student |
| `GET` | `/health` | — | Liveness probe |

Errors are always `{ "error": { "code": "...", "message": "..." } }`.

## Tests

The domain rules (approval chain, gate windows, QR tokens) have pure unit
tests in `apps/api/test/unit`. Every route group also has integration tests,
which run against a real Postgres:

```bash
docker compose up -d db
pnpm test           # unit + integration
pnpm typecheck      # all workspaces
```

Integration tests add rows to whatever database `DATABASE_URL` points at.
Point it at a scratch database, or re-run the seed afterwards.

## Deploying to Dokploy

Dokploy runs containers. The split is:

### 1. Database — Dokploy **Database → PostgreSQL**

Create a Postgres service in Dokploy. Copy its connection string; that becomes
`DATABASE_URL`. (Prisma is a library inside the API, not a Dokploy service.)

### 2. API — Dokploy **Application**

- **Source:** this Git repository.
- **Build type:** Dockerfile.
  - **Build context:** `.` (the repo root — required for the monorepo)
  - **Dockerfile path:** `apps/api/Dockerfile`
- **Environment variables:**

  | Variable       | Example                                             |
  | -------------- | --------------------------------------------------- |
  | `DATABASE_URL` | `postgresql://user:pass@host:5432/outpassed`        |
  | `JWT_SECRET`   | a long random string (≥16 chars)                    |
  | `JWT_EXPIRES_IN` | `7d`                                              |
  | `PORT`         | `3000`                                              |
  | `NODE_ENV`     | `production`                                        |
  | `CORS_ORIGIN`  | `*` or your allowed origins, comma-separated        |
  | `QR_SECRET`    | separate long random string for gate codes (falls back to `JWT_SECRET`) |
  | `QR_TTL_SECONDS` | `45`                                              |
  | `ADULT_PARENT_MODE` | `approve` or `notify_only` (students 18+)      |

- **Port:** expose `3000` and add a domain if you want one.
- The container runs `prisma migrate deploy` automatically on boot.

### 3. Website (landing page + web app) — Dokploy **Application**

Serves the landing page at `/` and the web version of the React Native app at
`/app`. The image builds the app with `expo export -p web` in its first stage,
so there's nothing to build by hand. Landing-page screenshots live in
`apps/web/screens`.

- **Build argument:** `EXPO_PUBLIC_API_URL` (default
  `https://api.outpassed.studentalumni.ai`). The API URL is baked into the web
  app at build time, so change it here, not in runtime env vars.
- Point `CORS_ORIGIN` on the API at this site's origin (or leave `*`).

- **Source:** this Git repository.
- **Build type:** Dockerfile.
  - **Build context:** `.` (the repo root)
  - **Dockerfile path:** `apps/web/Dockerfile`
- **Port:** expose `80` (attach a domain on port `80`).
- **Liveness:** `GET /health` returns `ok`.

Serve it on a different hostname from the API and point DNS at the same server.
This project's layout:

| Service | Hostname |
| ------- | -------- |
| Landing page | `https://outpassed.studentalumni.ai` |
| API | `https://api.outpassed.studentalumni.ai` |

> `api.outpassed.studentalumni.ai` is a third-level name, so it needs its own
> DNS record — a `*.studentalumni.ai` wildcard will not cover it.

### 4. Mobile app — **not** deployed to Dokploy

A React Native app is distributed as a native binary via **EAS**, not hosted by
Dokploy:

```bash
cd apps/mobile
npx eas-cli build --platform ios      # or android
npx eas-cli submit --platform ios
```

Set `EXPO_PUBLIC_API_URL` to your deployed API URL in `eas.json` / the EAS
environment so release builds point at production.

The same code also runs in a browser: `pnpm dev:mobile`, then press `w`
(served at `http://localhost:8081/app`). The production web build is part of
the website image above.

App icon, Android adaptive icon and splash screen are in `apps/mobile/assets`.

## Notes & known constraints

- **pnpm + Metro:** Metro (React Native) can't follow pnpm's symlinked
  `node_modules`, so `pnpm-workspace.yaml` sets `nodeLinker: hoisted`. pnpm 11+
  reads it there, not from `.npmrc`.
- **Prisma 6.x, client engine:** the client uses `engineType = "client"` with
  `@prisma/adapter-pg`, so no native query-engine binary is downloaded at
  runtime. `prisma migrate` still uses Prisma's schema engine.
- **Camera scanning** uses `expo-camera`. On web, and wherever camera access is
  denied, the guard can look a student up by roll number instead.
- **Visitor passes** are shared as a code through the system share sheet. A
  hosted link that shows the QR to the visitor is a natural next step.

## Follow-ups (not built)

- Push and SMS notifications to parents, wardens and hosts.
- Offline QR verification at the gate (Ed25519-signed tokens).
- Photo capture at the gate.
- Bulk student import (CSV).
- Refresh-token rotation and password reset.
- Multi-campus tenancy.
- CI/CD.
