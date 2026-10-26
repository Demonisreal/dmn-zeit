# syntax=docker/dockerfile:1.7
FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/demo-data/package.json packages/demo-data/package.json
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter @zeit/shared build \
	&& pnpm --filter @zeit/rules build \
	&& pnpm --filter @zeit/demo-data build \
	&& pnpm --filter @zeit/api build \
	&& pnpm --filter @zeit/api deploy --prod --legacy /out

FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime

RUN apt-get update \
	&& apt-get install -y --no-install-recommends --only-upgrade perl-base \
	&& rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ARG DBMATE_VERSION=2.37.0
ADD --checksum=sha256:f855e99a0f0a81322014bf686b1cb820d2b4d8074e4eadafd64b851b80ecb15a \
	https://github.com/amacneil/dbmate/releases/download/v${DBMATE_VERSION}/dbmate-linux-amd64 /usr/local/bin/dbmate
RUN chmod +x /usr/local/bin/dbmate

WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node db/migrations db/migrations
COPY --chown=node:node db/schema.sql db/schema.sql

USER node
ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
