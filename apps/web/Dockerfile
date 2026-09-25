# syntax=docker/dockerfile:1
FROM node:24-slim AS build
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

FROM caddy:2-alpine AS runtime
# the binary ships with cap_net_bind_service as file capability, under cap_drop: ALL exec fails with EPERM
RUN addgroup -S caddy && adduser -S -D -H -G caddy caddy \
	&& setcap -r /usr/bin/caddy

COPY --from=build --chown=caddy:caddy /repo/apps/web/dist /srv
COPY --chown=caddy:caddy apps/web/Caddyfile /etc/caddy/Caddyfile

USER caddy
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
