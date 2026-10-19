# syntax=docker/dockerfile:1

# Build context is the repository root (monorepo), so this image can see the
# workspace and the shared package. In Dokploy set:
#   Build context: .            Dockerfile path: apps/api/Dockerfile

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# openssl + ca-certificates are required by Prisma's query engine.
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Install workspace dependencies (cached on lockfile changes) ---
FROM base AS deps
# Toolchain for native modules (argon2) when no prebuilt binary is available.
# Kept out of the runtime stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# --- Generate the Prisma client and build the API ---
FROM deps AS build
COPY . .
RUN pnpm --filter @outpassed/api exec prisma generate \
  && pnpm --filter @outpassed/api build

# --- Runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
RUN chown -R node:node /app
USER node
EXPOSE 3000
# Apply pending migrations (safe on every boot), load demo data on demo
# servers (SEED_DEMO + DEMO_ACCOUNTS), then start.
CMD ["sh", "apps/api/scripts/start.sh"]
