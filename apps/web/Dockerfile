# syntax=docker/dockerfile:1
#
# Static "under construction" site, served by nginx.
# Build context is the repository root (monorepo):
#   Build context: .            Dockerfile path: apps/web/Dockerfile

FROM nginx:1.29-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/index.html /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
