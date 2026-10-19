# Outpass pilot launch checklist

The steps that need your accounts or devices. Work top to bottom; each part
says how to tell it worked.

## 1. Deploy on Dokploy

1. **Database**: create a PostgreSQL service and copy its connection string.
2. **API** (Application, Dockerfile `apps/api/Dockerfile`, build context `.`). Set:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | from step 1 |
   | `JWT_SECRET` | `openssl rand -base64 32` |
   | `QR_SECRET` | another `openssl rand -base64 32` (different from `JWT_SECRET`) |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | `https://outpassed.studentalumni.ai` |
   | `PUBLIC_WEB_URL` | `https://outpassed.studentalumni.ai` |
   | `CAMPUS_NAME` / `CAMPUS_ADDRESS` | the pilot campus, shown on visitor passes |
   | `SMTP_URL` / `MAIL_FROM` | your mail provider; **required**, password reset fails without it in production |
   | `ADULT_PARENT_MODE` | `approve` or `notify_only` |
   | `SETUP_TOKEN` | `openssl rand -base64 24`; needed once for first-time setup, remove afterwards |
   | `WHATSAPP_MODE` | `webhook` for your own WhatsApp server (or `evolution`, `waha`, `cloud`); **required** for sign-in codes and alerts |
   | `WHATSAPP_URL` / `WHATSAPP_TOKEN` | your server's send endpoint and its key |
   | `WHATSAPP_ALERTS` | `all`, or the list of alert kinds to send |
   | `SMS_PROVIDER` + MSG91/Twilio keys | only if you switch codes to SMS (`OTP_CHANNEL=sms`) |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | from the college's Razorpay dashboard; leave unset and students pay at the office or upload a screenshot |
   | `RAZORPAY_WEBHOOK_SECRET` | the secret you set on the Razorpay webhook (step 10) |
   | `JWT_EXPIRES_IN` | leave at `15m`; the app renews tokens itself |

   Attach `api.outpassed.studentalumni.ai` on port 3000. Migrations run on boot.
   *Check:* `https://api.outpassed.studentalumni.ai/health` returns `{"status":"ok"}`.
3. **Website** (Application, Dockerfile `apps/web/Dockerfile`, build context `.`).
   Build argument `EXPO_PUBLIC_API_URL=https://api.outpassed.studentalumni.ai`.
   Attach `outpassed.studentalumni.ai` on port 80.
   *Check:* `/` shows the landing page, `/app` shows sign-in, `/privacy` shows the policy.
4. **DNS**: an A record for both hostnames pointing at the Dokploy server.
   `api.outpassed.studentalumni.ai` needs its own record (a `*.studentalumni.ai`
   wildcard doesn't cover it).
5. **First-time setup**: open `https://outpassed.studentalumni.ai/app`. With no
   admin yet, it shows **Set up Outpass**: enter the college name and address,
   your admin account, the hostels and the `SETUP_TOKEN`. Then remove
   `SETUP_TOKEN` from the API settings. Don't run the demo seed against the
   pilot database.
6. **People**: in **People → Staff** add wardens and guards; in
   **People → Hostels** tick which hostels each warden covers; in
   **People → Import students** load the class list CSV (preview first).
   Students sign in with a texted code, or set a password with "Forgot password".
7. **Backups**: turn on Dokploy's scheduled PostgreSQL backups (to S3), or
   run `scripts/backup-db.sh` from cron. Restore one into a scratch database
   to check it works.
8. **Guards' phones**: sign in once on Wi-Fi so the phone downloads the pass
   key; after that, scanning works even when the gate has no signal.
9. **Photos**: ask students to add a photo on the **Me** tab before the pilot
   starts (or upload them from the college ID database in **People**).
10. **Departments and fees**: in **People → Departments** add each department,
    pick its HOD, and add faculty in **People → Staff** with their department
    (or use the `department` column in the student CSV). For online fee
    payments, add a Razorpay webhook pointing at
    `https://api.outpassed.studentalumni.ai/payments/razorpay/webhook` with the
    `payment_link.paid` event.
11. **Settings**: in **People → Settings** decide whether guards must photograph
    every exit and entry, whether students 18+ see offers, and turn on
    **School campus** for schools (hides offers and buy & sell).

## 2. Connect push notifications

1. `cd apps/mobile && npx eas-cli login && npx eas-cli init`. This writes the
   EAS `projectId` into `app.json`; push won't register without it.
2. Android: in the Expo dashboard → Credentials, upload an FCM V1 service account
   key (from Firebase → Project settings → Service accounts).
3. iOS: EAS creates the push key during the first iOS build if you let it.

## 3. Build and test on real phones

```bash
cd apps/mobile
npx eas-cli build --profile preview --platform android   # installable APK link
npx eas-cli build --profile preview --platform ios       # needs an Apple developer account; register test iPhones first
```

Test with one phone per role (student, parent, warden, guard):

- [ ] Student requests an outpass → parent's phone gets an alert within a few seconds; tapping it opens the request.
- [ ] Parent approves → warden gets an alert; warden approves → student gets "Outpass approved".
- [ ] Student opens the gate pass; the QR changes about every 30 s and the gold bar drains.
- [ ] Guard scans the QR with the camera in daylight and under the gate light at night.
- [ ] A screenshot of the QR taken more than a minute earlier is refused ("This code has expired").
- [ ] Guard turns on airplane mode, lets a student out, turns it off → the movement syncs and the parent gets "left campus".
- [ ] Student stays out past the return time → within 5 minutes the student, parent and warden get an overdue alert, once.
- [ ] Host invites a visitor → the share sheet sends a link; the link opens in the visitor's browser with QR and 6-digit code; guard lets them in with the code.
- [ ] Guard registers a walk-in → host gets "at the gate"; host approves → guard gets "Let … in".
- [ ] "Forgot password?" sends an email with a code and the code signs you in.
- [ ] Sign out on a phone → that phone stops getting the previous user's alerts.

## 4. Submit to the stores

1. Fill in store listings from [`store-listing.md`](store-listing.md).
2. Replace the contact email in `apps/web/privacy.html` and link
   `https://outpassed.studentalumni.ai/privacy` as the privacy policy URL in both stores.
3. Provide a reviewer login (a demo student and guard on a staging server) in
   App Review notes; reviewers need to see the gate pass and scanner.
4. `npx eas-cli build --profile production --platform all` then
   `npx eas-cli submit --platform ios` / `--platform android`.
