import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle the workspace package into the output so the runtime image only
  // needs the API's own dependencies. Everything in `dependencies` (Fastify,
  // Prisma, argon2) stays external and is resolved from node_modules.
  noExternal: ["@outpassed/shared"],
});
