# syntax=docker/dockerfile:1
#
# Outpass website: the landing page at / and the web build of the React
# Native app at /app, both served by nginx.
# Build context is the repository root (monorepo):
#   Build context: .            Dockerfile path: apps/web/Dockerfile
#
# The API URL is baked into the web app at build time:
#   --build-arg EXPO_PUBLIC_API_URL=https://api.example.com

# --- Build the web version of the mobile app ---
FROM node:22-bookworm-slim AS app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter "@outpassed/mobile..."
COPY packages/shared packages/shared
COPY apps/mobile apps/mobile
ARG EXPO_PUBLIC_API_URL=https://api.outpassed.studentalumni.ai
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
RUN cd apps/mobile && CI=1 pnpm exec expo export -p web --output-dir /out

# --- Serve ---
FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/index.html /usr/share/nginx/html/index.html
COPY apps/web/privacy.html /usr/share/nginx/html/privacy.html
COPY apps/web/screens /usr/share/nginx/html/screens
COPY --from=app /out /usr/share/nginx/html/app

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
