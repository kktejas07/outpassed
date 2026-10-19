# Demo / staging server

A separate Outpass server loaded with mock data, for showing the app and for
testers. Everyone signs in with one tap from the sign-in screen.

**Never point this at a real college's database:** the demo data reloads on
every restart and wipes passes, fees, events, listings and offers.

## Deploy on Dokploy (about 15 minutes)

1. **Create → Compose**, source: this repository, branch
   `feat/arvio-campus-gate` (or `main` once merged), compose path
   `docker-compose.demo.yml`.
2. **Environment** tab:

   | Variable | Value |
   |---|---|
   | `DEMO_API_URL` | `https://api-demo.outpassed.studentalumni.ai` |
   | `DEMO_WEB_URL` | `https://demo.outpassed.studentalumni.ai` |
   | `JWT_SECRET` | `openssl rand -base64 32` |
   | `QR_SECRET` | another `openssl rand -base64 32` |

3. **Domains** tab: `demo.outpassed.studentalumni.ai` → service `web`, port 80;
   `api-demo.outpassed.studentalumni.ai` → service `api`, port 3000. Add A
   records for both names pointing at the Dokploy server.
4. **Deploy.** The API applies migrations, loads the demo data and starts.
   *Check:* `https://api-demo.outpassed.studentalumni.ai/setup` lists the demo
   accounts, and `https://demo.outpassed.studentalumni.ai/app` shows them on
   the sign-in screen.

To refresh the data (dates move, so the Diwali sale and events stay current),
restart the `api` service.

## Run it on a laptop instead

```bash
docker compose -f docker-compose.demo.yml up --build
# website + app: http://localhost:8080/app     API: http://localhost:3000
```

## Mobile

- **Web on a phone:** open `https://demo.outpassed.studentalumni.ai/app` in
  the phone's browser. Everything works except the camera QR scan (the guard
  can look students up by roll number).
- **Native app:** install Expo Go, then from `apps/mobile` run
  `EXPO_PUBLIC_API_URL=https://api-demo.outpassed.studentalumni.ai npx expo start`
  and scan the QR code. For testers without a laptop, build a preview with EAS
  (`eas build --profile preview`) using the same `EXPO_PUBLIC_API_URL`.

## Demo accounts

Password for all: `outpass-demo-123`

| Role | Email | Who |
|---|---|---|
| Student | student@outpass.dev | Asha Rao, CSE, Block C |
| Student, under 18 | diya@outpass.dev | Diya Rao, Asha's sister (roll 26CS011): no photos until her mother agrees |
| Parent | parent@outpass.dev | Lakshmi Rao, mother of Asha and Diya |
| Faculty (HOD) | faculty@outpass.dev | Dr. Ramesh Kumar, head of CSE |
| Faculty | anita@outpass.dev | Prof. Anita Sharma, CSE |
| Warden | warden@outpass.dev | Mr. Suresh Nair |
| Guard | guard@outpass.dev | Main Gate |
| Admin | admin@outpass.dev | Dr. Meera Iyer |

More students: `karthik@outpass.dev`, `priya@outpass.dev`. Sign-in codes on
WhatsApp are off on the demo; use email and password (or the one-tap list).

## What's in the mock data

- Outpasses waiting on a parent, approved, out and overdue
- Fees: hostel due in 3 days, bus pass overdue, mess paid
- Events (Techfest, placement talk, cultural night) and one waiting for review
- Buy & sell listings, including a running **Diwali Dhamaka** sale
- Offers: Code Spectra mock test, Skyline training, Araxis internships,
  Blinkit/Zepto, coupons; three of them in the banner strip
