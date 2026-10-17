# Outpassed

A full-stack starter scaffold: an **Expo (managed) React Native** app, a
**Node + TypeScript (Fastify)** API, and **Postgres** via **Prisma**, wired
together end to end and deployable to **Dokploy**.

It ships one placeholder CRUD entity called `Record` (auth-protected, scoped to
its owner) to prove the whole path works. Swap it for your real domain later —
see [`docs/superpowers/specs/2026-10-17-outpassed-scaffold-design.md`](docs/superpowers/specs/2026-10-17-outpassed-scaffold-design.md) §11.

## Layout

```
apps/api       Fastify + Prisma API (Dockerized)
apps/mobile    Expo Router app
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

## API

| Method   | Path             | Auth | Description                |
| -------- | ---------------- | ---- | -------------------------- |
| `POST`   | `/auth/register` | —    | Create account, return JWT |
| `POST`   | `/auth/login`    | —    | Log in, return JWT         |
| `GET`    | `/auth/me`       | ✅   | Current user               |
| `GET`    | `/records`       | ✅   | List your records          |
| `POST`   | `/records`       | ✅   | Create a record            |
| `GET`    | `/records/:id`   | ✅   | Read one record            |
| `PATCH`  | `/records/:id`   | ✅   | Update a record            |
| `DELETE` | `/records/:id`   | ✅   | Delete a record            |
| `GET`    | `/health`        | —    | Liveness probe             |

Errors are always `{ "error": { "code": "...", "message": "..." } }`.

## Tests

Tests run against a real Postgres database, so start it first:

```bash
docker compose up -d db
pnpm test           # auth + full CRUD + authorization tests
pnpm typecheck      # all workspaces
```

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

- **Port:** expose `3000` and add a domain if you want one.
- The container runs `prisma migrate deploy` automatically on boot.

### 3. Mobile app — **not** deployed to Dokploy

A React Native app is distributed as a native binary via **EAS**, not hosted by
Dokploy:

```bash
cd apps/mobile
npx eas-cli build --platform ios      # or android
npx eas-cli submit --platform ios
```

Set `EXPO_PUBLIC_API_URL` to your deployed API URL in `eas.json` / the EAS
environment so release builds point at production.

> Optional: `npx expo export -p web` produces static assets Dokploy *can* serve
> if you later want a web version. Not set up here.

## Notes & known constraints

- **pnpm + Metro:** `.npmrc` sets `node-linker=hoisted` because Metro (React
  Native) cannot follow pnpm's default symlinked `node_modules`.
- **Prisma 6.x** is pinned deliberately: Prisma 7 removed `url` from the schema
  and requires `prisma.config.ts` + a driver adapter. Upgrade when you're ready.
- The Prisma model is named `Record`, which collides with TypeScript's built-in
  `Record<K, V>` utility type. It is imported as `RecordRow` in the API to keep
  both usable.

## Follow-ups (not built)

Refresh-token rotation, password reset/email verification, social login, CI/CD,
RBAC, and an optional web build hosted on Dokploy.
