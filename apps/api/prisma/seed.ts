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

async function upsertUser(email: string, name: string, role: "STUDENT" | "PARENT" | "WARDEN" | "GUARD" | "ADMIN", phone?: string) {
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

  console.log(`Seeded demo accounts. Password for all: ${PASSWORD}`);
  console.log("  student@outpass.dev  parent@outpass.dev  warden@outpass.dev  guard@outpass.dev  admin@outpass.dev");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
