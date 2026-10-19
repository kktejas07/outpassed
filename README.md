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
and `admin@outpass.dev`, plus two more students (`karthik@`, `priya@`) and
three faculty (`faculty@` is Dr. Ramesh Kumar, HOD of CSE; `anita@`, `vikram@`).
It also seeds departments, fees, events, buy & sell listings and offers.
It also creates passes in a few states: pending, approved, and out/overdue.
Re-running it resets the demo activity.

On a demo or staging server, set `DEMO_ACCOUNTS=true` on the API and the
sign-in screen lists these accounts so testers sign in with one tap (web and
mobile). Never set it for a real college. A ready-made demo stack is in
`docker-compose.demo.yml`; see [`docs/demo-server.md`](docs/demo-server.md).

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

**Hostels and wardens**

- Each student belongs to a hostel. An admin assigns wardens to hostels in
  **People → Hostels**. A warden sees requests, dashboard numbers, alerts and
  notices only for their hostels; a warden with no hostels covers all of them.

**Sign-in and sessions**

- Students and parents can sign in with a code sent on **WhatsApp** to the
  phone number the college has on file, or with email and password. (SMS is a
  fallback: `OTP_CHANNEL=sms`.)
- Access tokens last 15 minutes. The app renews them with a refresh token
  that works once; if an old one is presented again, every session from that
  sign-in ends. Resetting a password signs out all devices.
- Sign-in, code and gate routes are rate-limited per address
  (`@fastify/rate-limit`), and every response carries security headers
  (`@fastify/helmet`).

**WhatsApp**

- WhatsApp is the main channel. Every alert (parent approvals, left/returned,
  overdue, SOS, parcels, notices) goes to the recipient's WhatsApp as well as
  the in-app inbox and push, with a link that opens the right screen. Visitors
  get their pass link and 6-digit code on WhatsApp the moment they're invited,
  and imported students and parents get a welcome message.
- `WHATSAPP_MODE=webhook` posts `{ to, phone, text, kind, code }` to your own
  WhatsApp server. Evolution API, WAHA and Meta's Cloud API are also
  supported directly. `WHATSAPP_ALERTS` picks which alerts go out.

**Gate checks without internet**

- Passes are signed with Ed25519 (`v2.<payload>.<signature>`). The payload
  carries the name, the pass window and its status, so a guard's phone can
  check a pass with only the public key it downloads from `GET /gate/key`.
- With no network, the guard's phone shows "Checked on this phone" and queues
  the movement; it syncs when the network is back, and the server re-checks
  the live status then. The student's app keeps an offline copy of the pass
  (valid until the return time, at most a day) for when their phone is offline.
- The key is derived from `QR_SECRET`, or set `QR_SIGNING_KEY` (32 bytes,
  base64) to manage it separately. Codes from older app versions (`v1`) are
  still accepted.

**Night roll call**

- Wardens open **Roll call**, tap each student present (tap again for
  absent) or mark the rest present, then finish. Students out on a pass are
  filled in automatically. Finishing marks anyone left as absent and tells
  their parents on WhatsApp and in the app; the other wardens of that hostel
  get a summary. Marks can be corrected later, and corrections are logged.
- A roll call before 6 AM counts for the previous night (`CAMPUS_TZ`).

**Regular visitor pass**

- "Regular visitor" on the invite form gives one pass for set weekdays and
  hours (e.g. Sundays 10 AM–6 PM) for up to 6 months. The same code works on
  every visit; outside those days and hours the gate refuses it.

**Reports and activity log**

- **Reports** shows outpasses, movements, late returns, roll-call absences,
  visitors and who is often late, for today / 7 days / 30 days / this month
  and per hostel. Each report downloads as CSV (opens in Excel) through a
  10-minute signed link.
- **People → Activity log** lists approvals, overrides, extensions, roll
  calls, SOS responses, notices, imports, exports and account changes.

**Photos at the gate**

- Students add a photo on the **Me** tab (admins and wardens can add one in
  **People**). The guard's verdict shows it large so they can compare faces;
  with no photo on file it says to check the college ID.

**Faculty and HOD permission**

- Each student and faculty member belongs to a department (**People →
  Departments**, where the admin also picks the HOD).
- A request asks *why* the student is going out (sick / medical, home or family
  trip, academic, personal, local outing, emergency) and *who gave permission*.
  That faculty member approves first, then the parent, then the warden.
- The HOD is told about every pass from their department; the faculty member
  and HOD also hear when the student leaves and comes back.
- **Emergency** skips the faculty step and goes straight to the warden, with
  the parent, faculty member and HOD alerted at once. A warden can decide a
  pass still waiting on faculty, with a logged reason.

**Photos at every exit and entry**

- With **Settings → Photo at every exit and entry** on, the guard takes a photo
  before *Let out* / *Let in*. If the camera fails they can skip; skips are logged.
- Walk-in visitors: name and phone are required, ID / roll number is optional,
  and a photo is taken. The guard picks the student **or faculty member** they
  are visiting, and that person gets the alert with the photo.

**Photo consent and retention**

- Students under 18 (and every student when **School campus** is on) are not
  photographed until a linked parent agrees in their app. Until then uploads are
  refused, the guard is told to check the college ID, and gate photos sent
  anyway are not kept. Withdrawing deletes the profile photo and every gate
  photo. Agreeing and withdrawing are in the activity log.
- **Settings → Keep gate photos for** (30 days, 90 days (default), 6 months,
  1 year): exit, entry and visitor photos older than that are deleted every
  6 hours; the movement log stays.

**Fees**

- The office assigns a fee (hostel, mess, bus, tuition, exam, fine, other) to
  all students, a hostel or a department (**People → Fees**).
- Students and parents see what's due and can pay online (Razorpay payment
  link) or upload a payment screenshot with the UTR for the office to check.
  The office can also mark counter payments or waive a fee.
- Reminders go out 3 days before, on the due day, then weekly while overdue
  (parents are included once it's overdue).

**Campus tab: events, buy & sell, offers**

- **Events:** anyone can propose one; the admin approves it (admin events go
  live at once) and every student and faculty member is told. Students register
  with a seat limit and can cancel.
- **Buy & sell:** students list books, cycles, gadgets and so on. Listings are
  approved by the admin; buyers tap *I'm interested*, which tells the seller and
  opens a WhatsApp chat. Three reports hide a listing.
- **Banners and campus sales:** a banner strip at the top of the student home
  and Campus tab pages through running sales and offers the admin featured
  ("Add to banner" in **People → Offers**). **People → Sales & seasons** starts a
  sale (Diwali, exam season, freshers' move-in) with a colour, icon and dates;
  it gets its own page, students can list items for it, and offers can be
  tagged to it. Under-18s see the student listings but not sponsored offers.
- **Offers & opportunities:** sponsored listings the admin adds (coding tests,
  courses and training, internships, food near campus, coupons). Every student
  sees the same list: nothing is targeted and only total taps are counted. They
  are hidden for students under 18 or without a date of birth, and **Settings →
  School campus** hides offers and buy & sell for everyone.

**Getting a college started**

- On a new server the app opens **Set up Outpass**: the college's name and
  address (shown on visitor passes), the first admin and the hostels. In
  production it asks for `SETUP_TOKEN`.
- **People → Import students** takes a CSV (name, rollNo, email or phone,
  hostel, room, dateOfBirth, parent name/email/phone, relation), previews every
  row, then creates or updates students and links their parents. Re-importing
  the same file updates rather than duplicates.

**App structure (MVVM)**

- Screens live in `apps/mobile/app/` (Expo Router). Each role has its own tab
  group: `student`, `parent`, `faculty`, `warden`, `guard` and `admin`.
- Each screen gets its state and actions from a viewmodel hook in
  `src/features/*`.
- Shared UI is in `src/ui` and `src/components`, and design tokens are in
  `src/theme/tokens.ts`. The look follows the CardioLife reference: quiet
  white pages with one bold indigo card per screen, white headers (avatar,
  greeting, bell) over a big two-tone title, an indigo tab bar with a white
  active pill, pill buttons and chips, and overlapping avatars for the people
  involved. Teal marks allowed and safe states, red denied and overdue. Sora
  and Manrope type. A ribbon slides in after each action; big moments also
  drop confetti.

## API

All routes except auth, setup, hostels, public and health need a `Bearer` token. Roles are enforced
on the server.

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | — | Student or parent sign-up |
| `POST` | `/auth/login` | — | Log in; returns a 15-minute access token and a refresh token |
| `POST` | `/auth/refresh` | — | Swap a refresh token for a new pair (each works once; reuse ends the session family) |
| `POST` | `/auth/logout` | — | Revoke this device's refresh token |
| `POST` | `/auth/otp/request` · `/auth/otp/verify` | — | Text a 6-digit code to a phone on file, then sign in with it |
| `GET` · `POST` | `/setup` | — | First-time setup: college name, first admin, hostels (only until an admin exists) |
| `GET` | `/hostels` | — | Hostel names for the sign-up picker |
| `GET` · `POST` · `PATCH` | `/admin/hostels[/:id]` | admin (list: also warden) | List, add or rename hostels |
| `POST` · `DELETE` | `/admin/hostels/:id/wardens[/:userId]` | admin | Assign or unassign a warden |
| `PUT` | `/me/photo` · `/admin/users/:id/photo` | any · admin, warden | Upload a profile photo (base64 JPEG/PNG, ≤ 500 KB) |
| `GET` | `/photos/:userId?v=&exp=&sig=` | signed link | The photo, from the `photoUrl` in API responses |
| `POST` | `/admin/import/students` | admin | CSV import of students and parents (`dryRun` previews) |
| `GET` | `/auth/me` | any | Current user, with student profile |
| `GET` | `/outpasses?scope=all\|actionable` | student, parent, warden, admin | Passes the caller can see; `actionable` returns the ones waiting on them |
| `POST` | `/outpasses` | student | Request a pass |
| `GET` | `/outpasses/:id` | as above | One pass, with its approvals |
| `POST` | `/outpasses/:id/decision` | parent, warden, admin | Approve or reject (an override needs a `reason`) |
| `POST` | `/outpasses/:id/cancel` | student | Cancel before leaving |
| `GET` | `/outpasses/:id/qr` | student | Fresh gate QR token |
| `POST` | `/gate/scan` | guard, admin | Verify a QR (read-only verdict) |
| `GET` | `/gate/lookup?rollNo=` or `?code=` | guard, admin | Student's pass by roll number, or visitor's by 6-digit code |
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
| `POST` | `/auth/forgot` | — | Email a 6-digit reset code |
| `POST` | `/auth/reset` | — | Reset the password with the code (signs in) |
| `GET` | `/notifications` | any | Your alerts and unread count |
| `POST` | `/notifications/read` | any | Mark some or all read |
| `POST` | `/devices` · `/devices/remove` | any | Register or remove this phone for push |
| `GET` | `/public/visit-pass/:token` | — | Visitor's pass for the shared link |
| `POST` | `/outpasses/:id/extend` | student | Ask to return later (with a reason) |
| `POST` | `/outpasses/:id/extend/decision` | warden, admin | Give more time or decline |
| `POST` | `/parcels` | guard, admin | Log a parcel by roll number (student gets a 4-digit code) |
| `GET` | `/parcels?scope=waiting\|recent` | student, staff | Your parcels, or those at the gate |
| `POST` | `/parcels/:id/collect` | guard, admin | Hand over when the code matches |
| `POST` | `/sos` | any | Raise an emergency alert (medical, safety, other) |
| `GET` | `/sos` | any | Your alerts, or open and recent ones for staff |
| `POST` | `/sos/:id/acknowledge` · `/resolve` | staff (resolve: also the raiser) | Respond to and close an alert |
| `GET` | `/notices` | any | Notice board for your audience, with read state |
| `POST` | `/notices` | warden, admin | Post to students, parents or everyone |
| `POST` | `/notices/:id/read` · `DELETE /notices/:id` | any · author/admin | Mark read · remove |
| `GET` | `/gate/key` | guard, admin | Public key for checking passes offline |
| `GET` | `/rollcall?hostelId=` | warden, admin | Tonight's roll-call sheet |
| `POST` | `/rollcall/mark` · `/mark-rest` · `/close` | warden, admin | Mark a student, mark the rest present, finish (alerts parents of absentees) |
| `GET` | `/reports/summary?from&to&hostelId` | warden, admin | Report numbers for a date range |
| `POST` | `/reports/link` → `GET /reports/export.csv` | warden, admin | Signed 10-minute CSV download |
| `GET` | `/admin/audit?limit&before` | admin | Activity log |
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

Tests use their own database: `outpassed_test` next to your `DATABASE_URL`
(or `TEST_DATABASE_URL`). It's created and migrated automatically, so tests
never touch development or demo data. GitHub Actions runs the migrations,
typecheck, tests and build on every push (`.github/workflows/ci.yml`).

## Backups

`scripts/backup-db.sh` writes a compressed `pg_dump` and keeps 14 days.
Run it nightly from cron and copy the folder off the server. If you use
Dokploy's PostgreSQL service, also turn on its scheduled backups to S3.
Restore with `pg_restore --no-owner -d <database> <file>.dump`, and test a
restore once before the pilot.

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
so there's nothing to build by hand. The landing page (`apps/web/index.html`)
explains the app in words and one illustration rather than screenshots.

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

## Launching a pilot

The steps that need your accounts and devices (Dokploy, DNS, push
credentials, phone testing, store submission) are in
[`docs/launch-checklist.md`](docs/launch-checklist.md). Store copy and privacy
answers are in [`docs/store-listing.md`](docs/store-listing.md).

## Notes & known constraints

- **pnpm + Metro:** Metro (React Native) can't follow pnpm's symlinked
  `node_modules`, so `pnpm-workspace.yaml` sets `nodeLinker: hoisted`. pnpm 11+
  reads it there, not from `.npmrc`.
- **Prisma 6.x, client engine:** the client uses `engineType = "client"` with
  `@prisma/adapter-pg`, so no native query-engine binary is downloaded at
  runtime. `prisma migrate` still uses Prisma's schema engine.
- **Camera scanning** uses `expo-camera`. On web, and wherever camera access is
  denied, the guard can look a student up by roll number instead.
- **Photos** are stored in Postgres (`user_photos`), resized to 480 px by the
  app, so each is roughly 40–80 KB. Move them to object storage if a campus
  grows past tens of thousands of students.

## Follow-ups (not built)

- Multi-campus tenancy (one server per college today).
- Fee receipts as PDFs, and partial payments.
- Paid placement or ranking for offers (today every offer is shown the same way).
- Helpdesk and the other ideas in [`docs/mygate-learnings.md`](docs/mygate-learnings.md).
