import "dotenv/config";
import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./test/helpers/testDb";

export default defineConfig({
  test: {
    environment: "node",
    env: { NODE_ENV: "test", RATE_LIMIT: "false", DATABASE_URL: testDatabaseUrl() },
    globalSetup: ["./test/helpers/globalSetup.ts"],
    // Tests share one Postgres database; run files serially to avoid contention.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
