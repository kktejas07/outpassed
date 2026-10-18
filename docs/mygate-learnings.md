# What Outpass can take from MyGate

Notes from MyGate's resident app (October 2026 screens: home, invites, visitors
and security, community, payments, services). Each idea is mapped to who it
helps on a campus and how much it would take. ✅ means Outpass already does it.

## Already in Outpass

| MyGate | Outpass |
| --- | --- |
| Guest invite with QR **or** 6-digit code, date, start time and hours | ✅ Visitor invite: link with QR + 6-digit entry code, time window, campus name |
| Share invite to WhatsApp/SMS | ✅ Share sends a link; the visitor needs no app |
| Guard approves walk-ins with the resident | ✅ Walk-in → host alert → approve/decline → guard alert |
| MyPasses | ✅ Student's current pass and history |
| Alerts for entries and approvals | ✅ In-app inbox + phone push |
| Payment success timeline | ✅ Same pattern on the outpass approval timeline |

## For students (highest value first)

1. **Parcels and food deliveries at the gate** (MyGate: *Allow Delivery*, *Allow Future Entries*).
   Hostels get dozens of Swiggy, Zomato and Amazon drops a day. The guard logs a
   parcel against a student's roll number, and the student gets "Parcel at gate,
   collect with code 4821". The guard checks the code at handover. Students can
   pre-approve an expected delivery so the guard knows it's wanted.
   *Size: medium. New `Parcel` record, guard screen, student alert.*

2. **Late return request** (MyGate: *Message Guard*, *Call Security*).
   The student is stuck in traffic and asks to extend their return time from the
   pass screen. The warden approves in one tap. The parent is told, and the
   overdue alert waits for the new time.
   *Size: small. Extends the outpass approval chain.*

3. **SOS / Raise alert** (MyGate: *Raise Alert*).
   A big red button: medical, safety, or "I'm locked out". It reaches the
   on-duty guard and warden at once with the student's name, room and phone,
   and stays open until someone marks it handled.
   *Size: small–medium. Needs push to be reliable, which is now in place.*

4. **Hostel helpdesk** (MyGate: *Helpdesk*).
   Report water, electricity, Wi-Fi, furniture or cleaning problems with a photo.
   Track the status and rate the fix. Wardens see a queue by block.
   *Size: medium.*

5. **Notice board** (MyGate: *Announcements*, *Notice Board*).
   Mess menu changes, curfew changes, fest timings, exam-week rules. The warden
   posts, students get an alert, and the warden sees who has read it.
   *Size: small.*

6. **Hostel and mess dues** (MyGate: *Payments*, *Invoice*, *Mark as paid* with proof).
   Show fees and fines (including late-return fines) with due dates and an
   overdue banner. Pay by UPI, or mark as paid with a screenshot and reference
   number for the office to verify, exactly like MyGate's *Paid Amount Details*.
   *Size: medium–large. Needs a payment gateway (Razorpay/Cashfree) for "Pay now";
   mark-as-paid with proof works without one.*

7. **Frequent invite for parents** (MyGate: *Frequent Invite*).
   A parent who visits every Sunday gets one passcode valid for the semester,
   instead of a new invite each time.
   *Size: small. A visit with a recurring window.*

8. **Group invite for events** (MyGate: *Party/Group Invite*).
   One link with a limit ("up to 40 guests") for a fest or a parents' day. Each
   guest registers their name on the link and gets their own code.
   *Size: medium.*

9. **Ask Hostel** (MyGate: *Ask Society*).
   Students ask "What time is curfew on Saturdays?" or "Can I stay out for a
   wedding?" and get an answer from the hostel's own rulebook. The warden uploads
   the rules PDF once.
   *Size: medium. A natural fit for AXISS Cortex.*

10. **Amenity booking** (MyGate: *Amenities*).
    Gym slots, study rooms, badminton courts, laundry machines.
    *Size: medium.*

11. **Contacts** (MyGate: *Directory*, *Management Committee*, *Local Directory*).
    Wardens, the security desk, the hostel doctor, the nearest hospital and an
    ambulance, each with a call button.
    *Size: small.*

12. **Going-home pool** (MyGate: *Carpool*).
    Before holidays, show "4 students from your hostel are going to Vijayawada on
    Friday". This is opt-in only and shows first names only. Students can share
    a cab or book a bus together.
    *Size: medium. Built from outpass destinations, so it needs careful privacy.*

## For parents

- **Who can approve.** MyGate's *My Family* becomes a list of the guardians
  linked to the student, with a primary and a backup, so a second parent can
  approve when the first doesn't answer.
- **Pickup authorisation for schools.** MyGate's *Allow Kid Exit* becomes a
  parent naming who may collect the child today ("Uncle Ravi, 3:30 PM") with
  a code for the gate. This matters for the school version.
- **Dues and receipts** (see item 6).

## For wardens and admins

- **Hostel at a glance**, like MyGate's *Residents / Pets / Approvals* cards:
  total residents, in now, out now, overdue, and approval rate.
- **Daily staff at the gate** (MyGate: *Daily Help*). Track the attendance of
  mess workers, cleaners and electricians through the same gate scanner.
- **Vehicles** (MyGate: *My Vehicles*, *Search Vehicle*). Register student
  bikes so a guard can look up a number plate.
- **Polls** (MyGate: *Create poll*), for mess menu votes or event timings.

## For guards

- **Frequent-visitor codes** and **parcel logging** (above) are the two most
  common things a hostel guard does after outpasses.
- **Test alert** in settings (MyGate: *Test Notification*) helps during setup
  to check that push works on the guard's phone.

## What not to copy

- **Ads.** MyGate fills the home screen with banner and pop-up ads. Most
  students are minors or young adults, and parents and colleges need to trust
  the app. Keep Outpass ad-free, and earn money from the institution
  subscription and from payments instead.
- **Marketplace and home services** (Homes, Stores, Urban Company). These don't
  fit a hostel gate app. A student buy-and-sell board for books and cycles
  could come later, through StudentAlumni.ai rather than inside Outpass.
- **Themed invite cards** (food, balloons). They're nice, but not needed for
  campus visitors.

## Suggested order

1. Late return request, notice board, contacts and test alert: small, and
   visible in a pilot.
2. Parcels at the gate and SOS: the biggest daily value for hostels.
3. Helpdesk, then dues with mark-as-paid.
4. Frequent and group invites, Ask Hostel, amenities, going-home pool.
