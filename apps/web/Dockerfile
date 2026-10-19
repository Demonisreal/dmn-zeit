# syntax=docker/dockerfile:1
FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/demo-data/package.json packages/demo-data/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/rules packages/rules
COPY apps/web apps/web
COPY tsconfig.base.json ./
RUN pnpm --filter @zeit/shared build \
	&& pnpm --filter @zeit/rules build \
	&& pnpm --filter @zeit/web build

FROM caddy:2-builder@sha256:d842facfd63b960922e57444ff76fd8f0793a66dfdcf481af8026e1f4e6a39b4 AS caddy
ARG CADDY_VERSION=2.11.7
RUN xcaddy build v${CADDY_VERSION} --replace golang.org/x/net=golang.org/x/net@v0.60.0 --output /usr/bin/caddy

FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS runtime
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
RUN addgroup -S caddy && adduser -S -D -H -G caddy caddy \
	&& setcap -r /usr/bin/caddy

COPY --from=build --chown=caddy:caddy /repo/apps/web/dist /srv
COPY --chown=caddy:caddy apps/web/Caddyfile /etc/caddy/Caddyfile
RUN mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy

USER caddy
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
