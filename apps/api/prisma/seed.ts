/**
 * Demo data: one account per role, a linked parent, and a few outpasses and
 * visits in different states. Safe to re-run (upserts by email).
 *
 *   pnpm --filter @outpassed/api db:seed
 *
 * Every demo account uses the password `outpass-demo-123`.
 */
import argon2 from "argon2";
import { prisma } from "../src/lib/prisma";
import { newPassToken, newVisitCode } from "../src/lib/visitCode";
import { ensureHostel } from "../src/lib/hostels";
import { phoneFields } from "../src/lib/phone";

const PASSWORD = "outpass-demo-123";
const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

async function upsertUser(email: string, name: string, role: "STUDENT" | "PARENT" | "WARDEN" | "GUARD" | "ADMIN" | "FACULTY", phone?: string) {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    create: { email, name, role, ...phoneFields(phone), passwordHash },
    update: { name, role, ...phoneFields(phone) },
  });
}

async function main() {
  await prisma.institution.upsert({
    where: { id: 1 },
    create: { id: 1, name: "Sri Venkateswara Institute of Technology", address: "NH-16, Guntur, Andhra Pradesh" },
    update: {},
  });
  const blockC = await ensureHostel("Block C");
  await ensureHostel("Block A");
  await ensureHostel("Girls Hostel");
  const admin = await upsertUser("admin@outpass.dev", "Dr. Meera Iyer", "ADMIN");
  const warden = await upsertUser("warden@outpass.dev", "Mr. Suresh Nair", "WARDEN", "+919800000001");
  await upsertUser("guard@outpass.dev", "Ramesh (Main Gate)", "GUARD");
  const parent = await upsertUser("parent@outpass.dev", "Lakshmi Rao", "PARENT", "+919800000002");

  const students = [
    { email: "student@outpass.dev", name: "Asha Rao", rollNo: "21CS104", room: "214", phone: "+919800000010" },
    { email: "karthik@outpass.dev", name: "Karthik Menon", rollNo: "21ME231", room: "118", phone: "+919800000011" },
    { email: "priya@outpass.dev", name: "Priya Shah", rollNo: "22EC057", room: "305", phone: "+919800000012" },
  ];
  const ids: string[] = [];
  for (const s of students) {
    const user = await upsertUser(s.email, s.name, "STUDENT", s.phone);
    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, rollNo: s.rollNo, hostel: blockC.name, hostelId: blockC.id, room: s.room, dateOfBirth: new Date("2005-03-14") },
      update: { rollNo: s.rollNo, hostel: blockC.name, hostelId: blockC.id, room: s.room },
    });
    ids.push(user.id);
  }
  const [asha, karthik, priya] = ids as [string, string, string];

  await prisma.guardianship.upsert({
    where: { studentId_parentId: { studentId: asha, parentId: parent.id } },
    create: { studentId: asha, parentId: parent.id, relation: "Mother" },
    update: {},
  });

  // Asha's younger sister, a first-year under 18: no photos until her mother agrees.
  const diyaUser = await upsertUser("diya@outpass.dev", "Diya Rao", "STUDENT", "+919800000013");
  const diyaDob = new Date();
  diyaDob.setFullYear(diyaDob.getFullYear() - 17, 1, 10);
  await prisma.studentProfile.upsert({
    where: { userId: diyaUser.id },
    create: { userId: diyaUser.id, rollNo: "26CS011", hostel: blockC.name, hostelId: blockC.id, room: "220", dateOfBirth: diyaDob },
    update: { rollNo: "26CS011", hostel: blockC.name, hostelId: blockC.id, room: "220", dateOfBirth: diyaDob },
  });
  await prisma.guardianship.upsert({
    where: { studentId_parentId: { studentId: diyaUser.id, parentId: parent.id } },
    create: { studentId: diyaUser.id, parentId: parent.id, relation: "Mother", priority: 1 },
    update: {},
  });
  await prisma.photoConsent.deleteMany({ where: { studentId: diyaUser.id } });
  await prisma.userPhoto.deleteMany({ where: { userId: diyaUser.id } });
  ids.push(diyaUser.id);

  // Reset demo activity so the screens always show a fresh picture.
  await prisma.outpass.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.notification.deleteMany({});
  await prisma.visit.deleteMany({ where: { hostId: { in: [warden.id, admin.id] } } });

  await prisma.outpass.create({
    data: { studentId: asha, type: "HOME", destination: "Vijayawada", reason: "Sister's wedding", leaveAt: hours(2), returnBy: hours(72), status: "PENDING_PARENT" },
  });
  await prisma.outpass.create({
    data: {
      studentId: karthik,
      type: "LOCAL",
      destination: "City Mall",
      reason: "Buying lab supplies",
      leaveAt: hours(-5),
      returnBy: hours(-1),
      status: "OUT",
      exitedAt: hours(-4.5),
      approvals: { create: { step: "WARDEN", decision: "APPROVE", approverId: warden.id } },
    },
  });
  await prisma.outpass.create({
    data: {
      studentId: priya,
      type: "MEDICAL",
      destination: "Apollo Clinic",
      reason: "Dental appointment",
      leaveAt: hours(0),
      returnBy: hours(4),
      status: "APPROVED",
      approvals: { create: { step: "WARDEN", decision: "APPROVE", approverId: warden.id } },
    },
  });

  // Diya is cleared for an evening outing: the guard sees "no photo, parent hasn't agreed".
  await prisma.outpass.create({
    data: {
      studentId: diyaUser.id,
      type: "LOCAL",
      destination: "Stationery shop, Gate 2",
      reason: "Lab record and drafter",
      leaveAt: hours(-0.25),
      returnBy: hours(2),
      status: "APPROVED",
      approvals: { create: { step: "WARDEN", decision: "APPROVE", approverId: warden.id } },
    },
  });

  await prisma.visit.create({
    data: {
      visitorName: "Prof. Anil Gupta",
      visitorPhone: "+919811112222",
      visitorType: "GUEST",
      purpose: "Guest lecture, Seminar Hall 2",
      status: "APPROVED",
      validFrom: hours(-1),
      validTo: hours(5),
      hostId: admin.id,
      registeredById: admin.id,
      code: await newVisitCode(),
      passToken: newPassToken(),
    },
  });

  // More Block C residents, so roll call looks like a real night.
  const residents = [
    ["Rahul Verma", "23CS011", "101"], ["Sneha Pillai", "23CS012", "102"], ["Arjun Das", "23ME044", "110"],
    ["Kavya Reddy", "23EC019", "111"], ["Imran Khan", "22CS090", "205"], ["Divya Nair", "22EE031", "206"],
  ] as const;
  for (const [name, rollNo, room] of residents) {
    const email = `${name.split(" ")[0]!.toLowerCase()}@outpass.dev`;
    const u = await upsertUser(email, name, "STUDENT");
    await prisma.studentProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, rollNo, hostel: blockC.name, hostelId: blockC.id, room, dateOfBirth: new Date("2005-06-01") },
      update: { rollNo, hostel: blockC.name, hostelId: blockC.id, room },
    });
  }

  // Asha's mother visits every Sunday: one regular pass for the semester.
  await prisma.visit.deleteMany({ where: { hostId: asha } });
  await prisma.visit.create({
    data: {
      visitorName: "Lakshmi Rao",
      visitorPhone: "+919800000002",
      visitorType: "PARENT",
      purpose: "Sunday visit",
      status: "APPROVED",
      validFrom: hours(-1),
      validTo: hours(24 * 90),
      repeatDays: [0],
      dailyFrom: "10:00",
      dailyTo: "18:00",
      hostId: asha,
      registeredById: asha,
      code: await newVisitCode(),
      passToken: newPassToken(),
    },
  });

  // --- Departments, HOD and faculty ---
  const cse = await prisma.department.upsert({ where: { name: "Computer Science" }, create: { name: "Computer Science", code: "CSE" }, update: {} });
  const ece = await prisma.department.upsert({ where: { name: "Electronics" }, create: { name: "Electronics", code: "ECE" }, update: {} });
  await prisma.department.upsert({ where: { name: "Mechanical" }, create: { name: "Mechanical", code: "MECH" }, update: {} });
  const hod = await upsertUser("faculty@outpass.dev", "Dr. Ramesh Kumar", "FACULTY", "+919800000020");
  const anita = await upsertUser("anita@outpass.dev", "Prof. Anita Sharma", "FACULTY", "+919800000021");
  const vikram = await upsertUser("vikram@outpass.dev", "Prof. Vikram Rao", "FACULTY");
  await prisma.user.update({ where: { id: hod.id }, data: { departmentId: cse.id } });
  await prisma.user.update({ where: { id: anita.id }, data: { departmentId: cse.id } });
  await prisma.user.update({ where: { id: vikram.id }, data: { departmentId: ece.id } });
  await prisma.department.update({ where: { id: cse.id }, data: { hodId: hod.id } });
  await prisma.studentProfile.updateMany({ where: { rollNo: { contains: "CS" } }, data: { departmentId: cse.id } });
  await prisma.studentProfile.updateMany({ where: { rollNo: { contains: "EC" } }, data: { departmentId: ece.id } });

  // --- Fees ---
  const day = (n: number) => new Date(new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10));
  await prisma.fee.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.fee.createMany({
    data: [
      { studentId: asha, category: "HOSTEL", title: "Hostel fee · Semester 2", amountPaise: 4500000, dueDate: day(3), createdById: admin.id },
      { studentId: asha, category: "BUS", title: "Bus pass · October", amountPaise: 180000, dueDate: day(-4), createdById: admin.id, remindStage: 3, lastRemindedAt: new Date() },
      { studentId: asha, category: "MESS", title: "Mess fee · September", amountPaise: 350000, dueDate: day(-30), status: "PAID", paidAt: day(-32), createdById: admin.id },
      { studentId: karthik, category: "HOSTEL", title: "Hostel fee · Semester 2", amountPaise: 4500000, dueDate: day(3), createdById: admin.id },
      { studentId: priya, category: "FINE", title: "Late return fine", amountPaise: 20000, dueDate: day(7), note: "Returned 2 hours late on 12 Oct", createdById: admin.id },
    ],
  });

  // --- Events ---
  await prisma.campusEvent.deleteMany({});
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(hour - 5, 30, 0, 0); // campus time (IST)
    return d;
  };
  const fest = await prisma.campusEvent.create({
    data: { title: "Techfest 2026: Hackathon kick-off", description: "24-hour hackathon with mentors from industry. Teams of up to 4. Food, Wi-Fi and swag provided; prizes worth ₹1,00,000.", venue: "Main Auditorium", category: "Tech", startsAt: at(3, 10), endsAt: at(4, 10), capacity: 200, status: "APPROVED", createdById: admin.id, approvedById: admin.id },
  });
  await prisma.campusEvent.create({
    data: { title: "Placement talk: cracking coding interviews", description: "Alumni from product companies share how they prepared, with a live mock interview.", venue: "Seminar Hall 2", category: "Placement", startsAt: at(1, 16), endsAt: at(1, 18), capacity: 120, status: "APPROVED", createdById: hod.id, approvedById: admin.id },
  });
  await prisma.campusEvent.create({
    data: { title: "Cultural night: Dhamaka", description: "Music, dance and the inter-hostel band battle.", venue: "Open Air Theatre", category: "Cultural", startsAt: at(6, 18), endsAt: at(6, 22), status: "APPROVED", createdById: admin.id, approvedById: admin.id },
  });
  await prisma.campusEvent.create({
    data: { title: "Robotics club demo day", description: "Line followers, drones and a robot arm. Everyone welcome.", venue: "Lab 3, Block B", category: "Club", startsAt: at(5, 15), endsAt: at(5, 17), capacity: 60, status: "PENDING", createdById: karthik },
  });
  const rahul = await prisma.user.findUnique({ where: { email: "rahul@outpass.dev" } });
  for (const uid of [karthik, priya, ...(rahul ? [rahul.id] : [])]) await prisma.eventRegistration.create({ data: { eventId: fest.id, userId: uid } });

  // --- Occasions (sales and seasons with their own banner) ---
  await prisma.marketItem.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.occasion.deleteMany({});
  const DAY = 86_400_000;
  const diwali = await prisma.occasion.create({
    data: { name: "Diwali Dhamaka", tagline: "Lights, sweets and gifts from students and shops near campus", theme: "saffron", icon: "flame", startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() + 22 * DAY), createdById: admin.id },
  });
  await prisma.occasion.create({
    data: { name: "Exam season essentials", tagline: "Second-hand books, calculators and lab gear before finals", theme: "teal", icon: "book", startsAt: new Date(Date.now() + 30 * DAY), endsAt: new Date(Date.now() + 50 * DAY), createdById: admin.id },
  });
  await prisma.occasion.create({
    data: { name: "Freshers' move-in", tagline: "Buckets, mattresses and cycles for new hostel students", theme: "indigo", icon: "home", startsAt: new Date(Date.now() - 80 * DAY), endsAt: new Date(Date.now() - 60 * DAY), createdById: admin.id },
  });

  // --- Buy & sell ---
  const sneha = await prisma.user.findUnique({ where: { email: "sneha@outpass.dev" } });
  const items = [
    { sellerId: karthik, title: "Engineering Mathematics (Kreyszig, 10th ed.)", description: "Barely used, no markings. Pick up from Block C.", price: 350, category: "Books", condition: "Like new", status: "ACTIVE" as const },
    { sellerId: priya, title: "Hero Sprint cycle", description: "Good brakes, new tyres last month. Comes with a lock.", price: 2800, category: "Cycles", condition: "Used", status: "ACTIVE" as const },
    { sellerId: sneha?.id ?? asha, title: "Study table lamp (LED)", description: "Three brightness levels, USB powered.", price: 400, category: "Electronics", condition: "Used", status: "ACTIVE" as const, occasionId: diwali.id },
    { sellerId: priya, title: "Clay diyas, set of 12 (hand-painted)", description: "Painted them myself. Pick up from Block C before Diwali.", price: 180, category: "Other", condition: "New", status: "ACTIVE" as const, occasionId: diwali.id },
    { sellerId: karthik, title: "LED string lights, 10 m", description: "Warm white, used for one fest. Plug-in, with a remote.", price: 250, category: "Electronics", condition: "Like new", status: "ACTIVE" as const, occasionId: diwali.id },
    { sellerId: asha, title: "Rangoli colours kit + stencils", description: "10 colours, barely opened.", price: 120, category: "Other", condition: "Like new", status: "ACTIVE" as const, occasionId: diwali.id },
    { sellerId: asha, title: "Scientific calculator fx-991", description: "Works perfectly. Allowed in exams.", price: 600, category: "Electronics", condition: "Like new", status: "ACTIVE" as const },
    { sellerId: karthik, title: "Mattress (single)", description: "Moving out of the hostel.", price: 900, category: "Furniture", condition: "Used", status: "PENDING" as const },
  ];
  for (const it of items) await prisma.marketItem.create({ data: it });

  // --- Offers & opportunities ---
  await prisma.offer.createMany({
    data: [
      { category: "Coding & assessments", partnerName: "Code Spectra", title: "Free mock placement test", body: "A 60-minute coding and aptitude test with a detailed report. Good practice before campus drives.", url: "https://codespectra.ai", sortOrder: 10, showAsBanner: true, createdById: admin.id },
      { category: "Courses & training", partnerName: "Skyline Training Centre (near Gate 2)", title: "20% off full-stack weekend course", body: "8 weekends, project-based. Show your Outpass student ID at the desk.", couponCode: "OUTPASS20", sortOrder: 8, showAsBanner: true, createdById: admin.id },
      { category: "Internships & consulting", partnerName: "Araxis Systems", title: "Summer internships: apply by 30 Nov", body: "Paid internships in software engineering and data. Final-year and pre-final-year students.", url: "https://example.com/internships", sortOrder: 6, createdById: admin.id },
      { category: "Food near campus", partnerName: "Quick delivery apps", title: "Late-night snacks and groceries", body: "Blinkit and Zepto deliver to the main gate. Collect from the security desk; the guard logs your parcel.", url: "https://blinkit.com", sortOrder: 4, createdById: admin.id },
      { category: "Coupons", partnerName: "Campus stationery", title: "10% off lab records and drafters", body: "At the stationery shop in the admin block.", couponCode: "LAB10", sortOrder: 2, createdById: admin.id },
      { category: "Coupons", partnerName: "Sweet Magic (opp. Gate 1)", title: "15% off Diwali sweet boxes", body: "Kaju katli, motichoor and dry-fruit boxes. Show the code at the counter.", couponCode: "DIWALI15", sortOrder: 9, showAsBanner: true, occasionId: diwali.id, createdById: admin.id },
      { category: "Food near campus", partnerName: "Quick delivery apps", title: "Diwali gift hampers delivered to the gate", body: "Order hampers and pooja items on Blinkit or Zepto; collect at the security desk.", url: "https://www.zeptonow.com", sortOrder: 3, occasionId: diwali.id, createdById: admin.id },
    ],
  });

  console.log(`Seeded demo accounts. Password for all: ${PASSWORD}`);
  console.log("  student@outpass.dev  parent@outpass.dev  warden@outpass.dev  guard@outpass.dev  admin@outpass.dev  faculty@outpass.dev (HOD)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
