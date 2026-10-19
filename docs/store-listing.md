# Outpass store listing

Copy for the App Store and Google Play. Character limits are noted where the
stores enforce them.

## Name and subtitle

- **App name:** Outpass
- **Subtitle (iOS, 30):** Hostel outpasses and visitors
- **Short description (Play, 80):** Approve student outpasses, scan gate passes and manage campus visitors.

## Description

Outpass replaces the paper register at your hostel gate.

Students request an outpass in a few taps. Their parent approves on their phone, then the warden gives the final approval. The student shows a live QR pass at the gate. It changes every few seconds, so a forwarded screenshot won't work.

Guards scan the pass, check the student's face against their ID and let them out. Parents get an alert when their child leaves and when they're back. If a student misses their return time, the student, their parent and the warden are alerted.

Visitors get a link with a QR code and a 6-digit entry code. They don't need the app. Walk-ins are registered at the gate and approved by the person they've come to see.

For students: request outpasses, follow each approval, show your gate pass and invite visitors.
For parents: approve requests and know when your child leaves and returns.
For wardens: approve or override with a logged reason, see who's out and who's overdue.
For guards: scan passes or look up a roll number or visitor code, and keep recording when the Wi-Fi drops.

Outpass is set up by your college, hostel or school. Ask your hostel office for access.

## Keywords (iOS, 100)

outpass,hostel,gate pass,visitor,warden,college,campus,security,parents,attendance

## Category

- iOS: Education (secondary: Productivity)
- Play: Education

## Screenshots

Use the phone screenshots in `apps/web/screens` (1170×2532 originals can be
re-captured with the same flows): student gate pass, request form, parent
approval, warden dashboard, guard verdict, visitor pass.

## Privacy answers

**App Store "App Privacy" / Play "Data safety"**, all linked to the user's
identity, used for app functionality only, not for tracking or advertising:

| Data | Collected | Why |
| --- | --- | --- |
| Name, email, phone | Yes | Account and contact for approvals |
| User ID | Yes | Account |
| Other user content (outpass reasons, visitor details) | Yes | App functionality |
| Date of birth | Yes (students) | Decides if parent approval is required |
| Device ID (push token) | Yes | Notifications |
| Photos or camera images | No (camera only scans QR codes) | — |
| Location | No | — |

Data is encrypted in transit (HTTPS). Users can request deletion through their
institution's admin or the privacy contact.
