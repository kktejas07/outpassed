// Screen checks: signs in as every demo role with the one-tap list and opens
// that role's main screens in a phone-sized browser. Fails on any page error,
// a crashed screen, or a screen that doesn't show what it should.
//   WEB_URL=http://localhost:8082 node e2e/smoke.mjs
import fs from "node:fs";
import { chromium } from "playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:8082";
const OUT = process.env.SHOTS_DIR ?? "e2e-shots";
fs.mkdirSync(OUT, { recursive: true });

// [role label on the sign-in list, screens: [path, text that must appear]]
const plan = [
  ["Student", [["/app/student", "Diwali Dhamaka"], ["/app/student/campus", "Coming up"], ["/app/fees", "Total due"], ["/app/outpass/new", "Why are you going out?"], ["/app/events", "Techfest"], ["/app/market", "Buy & sell"], ["/app/helpdesk", "Helpdesk"], ["/app/student/account", "Sign out"]]],
  ["Student, under 18", [["/app/student/account", "your parent needs to allow photos"]]],
  ["Parent", [["/app/parent", "Allow photos of Diya?"], ["/app/parent/fees", "Total due"]]],
  ["Faculty (HOD)", [["/app/faculty", "Dr. Ramesh Kumar"]]],
  ["Warden", [["/app/warden", "Mr. Suresh Nair"], ["/app/helpdesk", "Helpdesk"], ["/app/rollcall", "Roll call"]]],
  ["Guard", [["/app/guard", "Main Gate"]]],
  ["Admin", [["/app/admin", "Campus now"], ["/app/admin/people", "People"], ["/app/fees-admin", "Fees"], ["/app/offers-admin", "Offers"], ["/app/settings", "Keep gate photos for"]]],
];

const failures = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

// The landing page first.
{
  const page = await browser.newPage();
  await page.goto(`${WEB}/`);
  if (!(await page.getByText("on record.").first().isVisible())) failures.push("landing: headline missing");
  await page.close();
}

for (const [role, screens] of plan) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${WEB}/app/login`);
    await page.getByText(role, { exact: true }).click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    for (const [path, text] of screens) {
      await page.goto(`${WEB}${path}`);
      const ok = await page
        .getByText(text, { exact: false })
        .first()
        .waitFor({ timeout: 12000 })
        .then(() => true)
        .catch(() => false);
      const crashed = await page.getByText("This screen hit a problem").isVisible().catch(() => false);
      const name = `${role}${path}`.replace(/[^\w]+/g, "-");
      if (!ok || crashed) {
        failures.push(`${role} ${path}: ${crashed ? "screen crashed" : `"${text}" not shown`}`);
        await page.screenshot({ path: `${OUT}/FAIL-${name}.png` });
      } else {
        await page.screenshot({ path: `${OUT}/${name}.png` });
      }
    }
  } catch (e) {
    failures.push(`${role}: ${e.message}`);
    await page.screenshot({ path: `${OUT}/FAIL-${role.replace(/\W+/g, "-")}.png` }).catch(() => undefined);
  }
  for (const e of errors) failures.push(`${role}: page error: ${e}`);
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`Screen checks failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Screen checks passed: ${plan.reduce((n, [, s]) => n + s.length, 0)} screens across ${plan.length} roles, plus the landing page.`);
