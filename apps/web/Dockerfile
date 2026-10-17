# syntax=docker/dockerfile:1
#
# Arvio landing page (static), served by nginx.
# Build context is the repository root (monorepo):
#   Build context: .            Dockerfile path: apps/web/Dockerfile

FROM nginx:1.29-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/index.html /usr/share/nginx/html/index.html
COPY apps/web/screens /usr/share/nginx/html/screens

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
