# Outpassed — Starter Scaffold Design

**Date:** 2026-10-17
**Status:** Approved (design); spec awaiting review
**Scope:** Generic full-stack starter — Expo (managed) React Native app, Node/TypeScript API, Postgres, deployable to Dokploy.

---

## 1. Overview

Outpassed is a new project (the repository starts empty). This spec defines a
generic starter scaffold: a React Native mobile client, a backend API, and a
Postgres database, wired together end to end and deployable to Dokploy.

The scaffold ships one **placeholder CRUD entity** named `Record`. The real
domain entity is not yet decided, so the entity is deliberately generic and
centralized to make swapping it a mechanical change (see §11). The scaffold's
purpose is to prove the full path — client → API → database — works, and to be a
clean base the real product is built on.

## 2. Goals

- A working, runnable monorepo: mobile app + API + database.
- Shared types and validation between client and server (no duplication).
- Email/password authentication with JWT.
- One complete CRUD resource, scoped to its owning user.
- Backend automated tests covering auth and CRUD.
- A Docker image for the API and a documented Dokploy deployment.

## 3. Non-goals (YAGNI)

Explicitly out of scope for this scaffold:

- Refresh-token rotation (access token only; rotation is a follow-up).
- Social/OAuth login, password reset, email verification, transactional email.
- Push notifications.
- CI/CD pipelines (Dokploy deploy is documented, not automated from git).
- Role-based access control / organizations / teams.
- UI/e2e automated tests.
- Deploying the mobile app as a web build (noted as an option in §9).

## 4. Architecture

A pnpm-workspace monorepo with three workspaces:

- `apps/api` — Fastify + TypeScript HTTP API.
- `apps/mobile` — Expo (managed) app with Expo Router.
- `packages/shared` — zod schemas and inferred TypeScript types shared by both.

Data flow: the mobile client calls the API over HTTP with a bearer token; the API
validates requests with zod schemas from `packages/shared`, authorizes with JWT,
and persists via Prisma to Postgres.

### Repository layout

```
outpassed/
  apps/
    api/                          # Node + TypeScript + Fastify
      src/
        index.ts                  # server bootstrap
        env.ts                    # zod-validated environment
        plugins/
          prisma.ts
          auth.ts                 # JWT verification + guard
          errorHandler.ts
        routes/
          auth.ts                 # register, login, me
          record.ts               # placeholder CRUD entity
      prisma/
        schema.prisma
        migrations/
      test/                       # Vitest
      Dockerfile                  # multi-stage build for Dokploy
      package.json
    mobile/                       # Expo (managed) + Expo Router
      app/
        (auth)/login.tsx
        (auth)/register.tsx
        (app)/index.tsx           # list
        (app)/new.tsx             # create
        (app)/[id].tsx            # detail / edit / delete
      src/
        api/client.ts             # typed fetch wrapper
        auth/tokenStore.ts        # expo-secure-store
        auth/session.tsx          # auth context / gate
      app.json
      package.json
  packages/
    shared/
      src/index.ts                # zod schemas + inferred types
      package.json
  docker-compose.yml              # local dev: postgres + api
  .env.example
  package.json                    # workspace root
  pnpm-workspace.yaml
  README.md
```

## 5. Data model

Postgres via Prisma. Two tables.

### User

| Column         | Type     | Notes                    |
| -------------- | -------- | ------------------------ |
| `id`           | uuid     | PK, default `gen_random_uuid()` |
| `email`        | text     | unique, not null         |
| `passwordHash` | text     | argon2id hash, not null  |
| `createdAt`    | timestamp| default now()            |

### Record (placeholder entity)

| Column        | Type      | Notes                              |
| ------------- | --------- | ---------------------------------- |
| `id`          | uuid      | PK                                 |
| `title`       | text      | not null                           |
| `description` | text      | nullable                           |
| `status`      | text      | not null, default `"active"`       |
| `ownerId`     | uuid      | FK → User.id, indexed, not null    |
| `createdAt`   | timestamp | default now()                      |
| `updatedAt`   | timestamp | updated on write                   |

`Record` is the stand-in for the real entity. See §11 for the swap procedure.

## 6. API

Fastify + Prisma + zod. All request bodies and query params are validated with
schemas from `packages/shared`.

### Error contract

Every error response has a stable shape:

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable" } }
```

Status mapping: zod validation failure → `400` (`VALIDATION_ERROR`); missing or
invalid token → `401` (`UNAUTHORIZED`); resource not found or not owned → `404`
(`NOT_FOUND`); unexpected → `500` (`INTERNAL_ERROR`).

### Routes

| Method   | Path             | Auth | Description                                  |
| -------- | ---------------- | ---- | -------------------------------------------- |
| `POST`   | `/auth/register` | No   | Create user, return `{ accessToken, user }`  |
| `POST`   | `/auth/login`    | No   | Verify credentials, return `{ accessToken, user }` |
| `GET`    | `/auth/me`       | Yes  | Return the current user                       |
| `GET`    | `/records`       | Yes  | List the caller's records                     |
| `POST`   | `/records`       | Yes  | Create a record owned by the caller           |
| `GET`    | `/records/:id`   | Yes  | Fetch one record (owner only)                 |
| `PATCH`  | `/records/:id`   | Yes  | Update a record (owner only)                  |
| `DELETE` | `/records/:id`   | Yes  | Delete a record (owner only)                  |
| `GET`    | `/health`        | No   | Liveness probe for Dokploy                    |

### Authentication

- Passwords hashed with **argon2id**.
- On login/register, the API issues a JWT **access token** signed with
  `JWT_SECRET`. For the scaffold the token is long-lived (e.g. 7 days); refresh
  rotation is a documented follow-up (§3).
- Protected routes require `Authorization: Bearer <token>`. The guard verifies
  the signature, loads the user id, and rejects with `401` on failure.
- Ownership is enforced in queries: every `Record` read/write filters by
  `ownerId`, so a user cannot touch another user's rows.

## 7. Mobile app

Expo (managed workflow) with Expo Router and an auth gate.

- **Session:** `src/auth/session.tsx` provides an auth context. On launch it
  reads a stored token; if present and `GET /auth/me` succeeds, the user is
  routed to `(app)`; otherwise to `(auth)`.
- **Token storage:** `expo-secure-store` (`src/auth/tokenStore.ts`).
- **API client:** `src/api/client.ts` — a thin typed wrapper around `fetch` using
  types from `packages/shared`; attaches the bearer token; on `401` clears the
  token and returns to login.
- **Screens:** login, register, list, create, detail/edit (with delete).

## 8. Testing

Vitest, run against the API. A test database is provided for the run (a
Dockerized Postgres in CI/local; `pg-mem` is an acceptable fast path if it
supports the required SQL — otherwise use a real ephemeral Postgres).

Covered tests:

1. **Auth flow** — register → login → `GET /auth/me` returns the same user;
   duplicate email rejected; wrong password rejected.
2. **CRUD flow** — create → list → fetch one → update → delete, all as the owner.
3. **Authorization** — no token → `401`; a second user cannot read/update/delete
   the first user's record → `404`.

No UI or end-to-end tests in the scaffold (§3).

## 9. Deployment — Dokploy

Dokploy hosts containers, so the split is:

- **Database:** Postgres as a Dokploy service. Provide `DATABASE_URL` to the API.
- **API:** a Dokploy **Application** built from `apps/api/Dockerfile` (multi-stage:
  install → build → slim runtime). Container entrypoint runs
  `prisma migrate deploy` and then starts the server. Required env:
  `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`.
- **Mobile:** **not deployed to Dokploy.** An Expo (managed) app is distributed
  via EAS Build/Submit to the App Store and Play Store; Dokploy has nothing to
  host for a native binary. The README documents the EAS steps.
  - Optional follow-up: `expo export -p web` produces static assets Dokploy can
    serve if a web version is wanted. Not built now.

Local development mirrors production with `docker-compose.yml` (Postgres + API).

## 10. Local development

- `pnpm install` at the root.
- `docker compose up -d db` for Postgres, or point `DATABASE_URL` at any local
  Postgres.
- `pnpm --filter api prisma migrate dev` then `pnpm --filter api dev` for the API.
- `pnpm --filter mobile start` for the Expo dev server (Expo Go / simulator),
  with the API base URL configured via `EXPO_PUBLIC_API_URL`.
- `.env.example` documents every variable.

## 11. Swapping the placeholder entity

The placeholder `Record` entity is centralized so swapping it is mechanical:

1. Edit `apps/api/prisma/schema.prisma` (rename the model, adjust fields) and
   generate a migration.
2. Rename/rewrite `packages/shared/src/index.ts` schemas and types.
3. Rename `apps/api/src/routes/record.ts` and update route registration.
4. Update the mobile screens' labels and fields.

No other layers need structural change: routing, auth, ownership scoping, error
handling, tests, and deployment are entity-agnostic.

## 12. Open questions

- The real domain entity is undecided; `Record` is a placeholder (§11).
- Token lifetime and whether refresh rotation is wanted before any production
  use.

## 13. Follow-ups (post-scaffold)

Refresh-token rotation; password reset/email verification; social login;
CI/CD; RBAC; optional web build on Dokploy.
