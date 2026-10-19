/**
 * Tests run against their own database (outpassed_test by default), so they
 * never add rows to the development or demo data. Set TEST_DATABASE_URL to
 * point somewhere else.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? "postgresql://outpassed:outpassed@localhost:5432/outpassed";
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/, "") || "/outpassed"}_test`;
  return url.toString();
}
