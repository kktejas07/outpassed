import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import pg from "pg";
import { testDatabaseUrl } from "./testDb";

/**
 * Creates the test database if needed and applies any migrations it hasn't
 * seen yet, straight from prisma/migrations (no Prisma engines needed).
 */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!dbName.endsWith("_test") && !process.env.ALLOW_NON_TEST_DB) {
    throw new Error(`Refusing to run tests against "${dbName}". Use a database whose name ends in _test.`);
  }

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const root = new pg.Client({ connectionString: admin.toString() });
  await root.connect();
  const exists = await root.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await root.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  await root.end();

  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(`CREATE TABLE IF NOT EXISTS "_test_migrations" ("name" text PRIMARY KEY, "appliedAt" timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ name: string }>(`SELECT "name" FROM "_test_migrations"`)).rows.map((r) => r.name));
  const dir = join(import.meta.dirname, "../../prisma/migrations");
  const pending = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !done.has(d.name))
    .map((d) => d.name)
    .sort();
  for (const name of pending) {
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(`INSERT INTO "_test_migrations" ("name") VALUES ($1)`, [name]);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw new Error(`Migration ${name} failed on the test database: ${(err as Error).message}`);
    }
  }
  await db.end();
}
