import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import type { ImportResult, ImportRow } from "@outpassed/shared";
import { parseCsv } from "./csv";
import { ensureHostel } from "./hostels";
import { sendMail } from "./mailer";
import { background } from "./notify";
import { env } from "../env";
import { sendWhatsApp, whatsappEnabled } from "./whatsapp";
import { phoneFields } from "./phone";
import { prisma } from "./prisma";

/** Column names we accept, with the spellings colleges tend to use. */
const ALIASES: Record<string, string> = {
  name: "name", studentname: "name", fullname: "name",
  rollno: "rollNo", roll: "rollNo", rollnumber: "rollNo", regno: "rollNo", registrationno: "rollNo", admissionno: "rollNo",
  email: "email", studentemail: "email",
  phone: "phone", mobile: "phone", studentphone: "phone", studentmobile: "phone",
  hostel: "hostel", block: "hostel", hostelblock: "hostel",
  room: "room", roomno: "room",
  dateofbirth: "dateOfBirth", dob: "dateOfBirth", birthdate: "dateOfBirth",
  parentname: "parentName", guardianname: "parentName", fathername: "parentName", mothername: "parentName",
  parentemail: "parentEmail", guardianemail: "parentEmail",
  parentphone: "parentPhone", parentmobile: "parentPhone", guardianphone: "parentPhone", guardianmobile: "parentPhone",
  relation: "relation", relationship: "relation",
  department: "department", dept: "department", branch: "department", course: "department",
};

export const REQUIRED_COLUMNS = ["name", "rollNo"] as const;

const email = z.email();

type Parsed = {
  name: string; rollNo: string; email: string; phone: string; hostel: string; room: string;
  dateOfBirth: string; parentName: string; parentEmail: string; parentPhone: string; relation: string; department: string;
};

/** Accepts 2004-08-21, 21/08/2004 or 21-08-2004. */
function parseDob(v: string): Date | null | "bad" {
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return "bad";
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || y < 1950 || date > new Date()) return "bad";
  return date;
}

/** Accounts made without an email get a placeholder they can't receive mail at. */
const placeholderEmail = (phone: string) => `p${phone.replace(/\D/g, "")}@phone.outpass.local`;
const unusablePassword = async () => argon2.hash(randomBytes(24).toString("base64url"), { type: argon2.argon2id });

/**
 * Imports students (and their parents) from a CSV. With dryRun nothing is
 * saved; each row says what would happen. Rows are independent: one bad
 * row doesn't stop the rest.
 */
export async function importStudents(csv: string, opts: { dryRun: boolean; sendWelcome: boolean }): Promise<ImportResult> {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  const header = (table.shift() ?? []).map((h) => ALIASES[h.toLowerCase().replace(/[^a-z]/g, "")] ?? null);
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw Object.assign(new Error(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`), { code: "MISSING_COLUMNS" });
  }
  if (!header.includes("email") && !header.includes("phone")) {
    throw Object.assign(new Error("Add an email or phone column so students can sign in"), { code: "MISSING_COLUMNS" });
  }
  if (table.length > 5000) throw Object.assign(new Error("Import at most 5,000 rows at a time"), { code: "TOO_MANY_ROWS" });

  const rows: ImportRow[] = [];
  const summary = { created: 0, updated: 0, parentsCreated: 0, parentsLinked: 0, hostelsCreated: 0, errors: 0 };
  const seenRoll = new Set<string>();
  const seenEmail = new Set<string>();
  const knownHostels = new Map((await prisma.hostel.findMany()).map((h) => [h.name.toLowerCase(), h]));
  const newParents = new Map<string, true>(); // parents created earlier in this file (dry run)

  for (let i = 0; i < table.length; i++) {
    const cells = table[i]!;
    const r = Object.fromEntries(Object.keys(ALIASES).map((k) => [ALIASES[k], ""])) as Parsed;
    header.forEach((key, idx) => {
      if (key) (r as Record<string, string>)[key] = (cells[idx] ?? "").trim();
    });
    const rowNo = i + 2; // spreadsheet row, counting the header
    const fail = (message: string) => {
      rows.push({ row: rowNo, name: r.name, rollNo: r.rollNo, action: "error", parent: "none", message });
      summary.errors++;
    };

    if (!r.name) { fail("Name is missing"); continue; }
    if (!r.rollNo) { fail("Roll number is missing"); continue; }
    if (r.rollNo.length > 40) { fail("Roll number is too long"); continue; }
    if (seenRoll.has(r.rollNo.toLowerCase())) { fail("This roll number appears twice in the file"); continue; }
    const studentEmail = r.email.toLowerCase();
    if (studentEmail && !email.safeParse(studentEmail).success) { fail(`"${r.email}" isn't a valid email`); continue; }
    const phone = phoneFields(r.phone);
    if (r.phone && !phone.phoneNormalized) { fail(`"${r.phone}" isn't a valid phone number`); continue; }
    const dob = parseDob(r.dateOfBirth);
    if (dob === "bad") { fail(`Date of birth "${r.dateOfBirth}" isn't a date (use 2004-08-21 or 21/08/2004)`); continue; }
    const parentEmail = r.parentEmail.toLowerCase();
    if (parentEmail && !email.safeParse(parentEmail).success) { fail(`Parent email "${r.parentEmail}" isn't valid`); continue; }
    const parentPhone = phoneFields(r.parentPhone);
    if (r.parentPhone && !parentPhone.phoneNormalized) { fail(`Parent phone "${r.parentPhone}" isn't valid`); continue; }

    const existing = await prisma.studentProfile.findUnique({ where: { rollNo: r.rollNo }, include: { user: true } });
    if (!existing) {
      if (!studentEmail && !phone.phoneNormalized) { fail("Needs an email or phone so the student can sign in"); continue; }
      const loginEmail = studentEmail || placeholderEmail(phone.phoneNormalized!);
      if (seenEmail.has(loginEmail) || (await prisma.user.findUnique({ where: { email: loginEmail } }))) {
        fail(studentEmail ? "Another account already uses this email" : "Another account already uses this phone");
        continue;
      }
      seenEmail.add(loginEmail);
    } else if (studentEmail && studentEmail !== existing.user.email) {
      const other = await prisma.user.findUnique({ where: { email: studentEmail } });
      if (other && other.id !== existing.userId) { fail("Another account already uses this email"); continue; }
    }
    seenRoll.add(r.rollNo.toLowerCase());

    // Parent: matched by email, then phone; otherwise a new parent account.
    let parentAction: ImportRow["parent"] = "none";
    let parentId: string | null = null;
    const parentKey = parentEmail || parentPhone.phoneNormalized;
    if (parentKey) {
      const found = parentEmail
        ? await prisma.user.findUnique({ where: { email: parentEmail } })
        : await prisma.user.findFirst({ where: { phoneNormalized: parentPhone.phoneNormalized, role: "PARENT" } });
      if (found && found.role !== "PARENT") { fail("The parent email belongs to a non-parent account"); continue; }
      if (found) {
        parentAction = "link";
        parentId = found.id;
      } else {
        parentAction = newParents.has(parentKey) ? "link" : "create";
      }
    }

    let hostel: { id: string; name: string } | null = null;
    if (r.hostel) {
      const key = r.hostel.replace(/\s+/g, " ").toLowerCase();
      const known = knownHostels.get(key);
      if (known) hostel = known;
      else {
        summary.hostelsCreated++;
        hostel = opts.dryRun ? { id: "", name: r.hostel } : await ensureHostel(r.hostel);
        knownHostels.set(key, hostel as { id: string; name: string; createdAt: Date });
      }
    }

    const action: ImportRow["action"] = existing ? "update" : "create";
    if (!opts.dryRun) {
      const dept = r.department ? await ensureDepartment(r.department) : null;
      const profile = {
        ...(hostel ? { hostel: hostel.name, hostelId: hostel.id } : {}),
        ...(dept ? { departmentId: dept.id } : {}),
        ...(r.room ? { room: r.room } : {}),
        ...(dob ? { dateOfBirth: dob } : {}),
      };
      let studentId: string;
      if (existing) {
        await prisma.user.update({
          where: { id: existing.userId },
          data: {
            name: r.name,
            ...(studentEmail ? { email: studentEmail } : {}),
            ...(r.phone ? phone : {}),
            student: { update: profile },
          },
        });
        studentId = existing.userId;
      } else {
        const created = await prisma.user.create({
          data: {
            email: studentEmail || placeholderEmail(phone.phoneNormalized!),
            passwordHash: await unusablePassword(),
            name: r.name,
            role: "STUDENT",
            ...phone,
            student: { create: { rollNo: r.rollNo, ...profile } },
          },
        });
        studentId = created.id;
        if (opts.sendWelcome && studentEmail) {
          await sendMail({
            to: studentEmail,
            subject: "Your Outpass account is ready",
            text: `Hi ${r.name},\n\nYour college has set up Outpass for you. Open the app, tap "Forgot password" and enter ${studentEmail} to choose your password${phone.phoneNormalized ? `, or sign in with a code sent to ${phone.phone}` : ""}.\n\nYou'll use Outpass for outpasses, visitors and parcels at the gate.`,
          }).catch(() => undefined);
        }
        if (opts.sendWelcome && phone.phoneNormalized) welcomeOnWhatsApp(phone.phoneNormalized, r.name, "student");
      }
      if (parentKey) {
        if (!parentId) {
          const existingParent =
            (parentEmail ? await prisma.user.findUnique({ where: { email: parentEmail } }) : null) ??
            (parentPhone.phoneNormalized ? await prisma.user.findFirst({ where: { phoneNormalized: parentPhone.phoneNormalized, role: "PARENT" } }) : null);
          if (existingParent) parentId = existingParent.id;
          else {
            const created = await prisma.user.create({
              data: {
                email: parentEmail || placeholderEmail(parentPhone.phoneNormalized!),
                passwordHash: await unusablePassword(),
                name: r.parentName || `Parent of ${r.name}`,
                role: "PARENT",
                ...parentPhone,
              },
            });
            parentId = created.id;
            if (opts.sendWelcome && parentPhone.phoneNormalized) welcomeOnWhatsApp(parentPhone.phoneNormalized, created.name, "parent", r.name);
          }
        }
        await prisma.guardianship.upsert({
          where: { studentId_parentId: { studentId, parentId } },
          create: { studentId, parentId, relation: r.relation || "Parent" },
          update: r.relation ? { relation: r.relation } : {},
        });
      }
    }
    if (parentKey) newParents.set(parentKey, true);

    rows.push({ row: rowNo, name: r.name, rollNo: r.rollNo, action, parent: parentAction, message: null });
    if (action === "create") summary.created++;
    else summary.updated++;
    if (parentAction === "create") summary.parentsCreated++;
    if (parentAction !== "none") summary.parentsLinked++;
  }

  return { dryRun: opts.dryRun, rows, summary };
}


/** "Your account is ready": sign in with a WhatsApp code to this number. */
function welcomeOnWhatsApp(to: string, name: string, who: "student" | "parent", child?: string) {
  if (!whatsappEnabled()) return;
  const app = `${env.PUBLIC_WEB_URL.replace(/\/+$/, "")}/app`;
  const text =
    who === "student"
      ? `Hi ${name.split(" ")[0]}, your college has set up *Outpass* for you: outpasses, visitors and parcels at the gate.\n\nGet the app or open ${app} and sign in with this number. We'll send you a code here.`
      : `Hello ${name}, ${child}'s college uses *Outpass*. You'll get a message here when ${child} asks to go out, leaves and returns to campus, and can approve requests from the app.\n\nSign in at ${app} with this number. We'll send you a code here.`;
  background(() => sendWhatsApp({ to, text, kind: "WELCOME", title: "Your Outpass account is ready", body: text }), "welcome whatsapp");
}

/** Finds a department by name or code (case-insensitive), or creates it. */
async function ensureDepartment(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  const found = await prisma.department.findFirst({ where: { OR: [{ name: { equals: clean, mode: "insensitive" } }, { code: { equals: clean, mode: "insensitive" } }] } });
  return found ?? prisma.department.upsert({ where: { name: clean }, create: { name: clean }, update: {} });
}
