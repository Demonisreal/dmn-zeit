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

COPY packages packages
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter @zeit/shared build \
	&& pnpm --filter @zeit/rules build \
	&& pnpm --filter @zeit/demo-data build \
	&& pnpm --filter @zeit/api build \
	&& pnpm --filter @zeit/api deploy --prod --legacy /out

FROM node:24-slim AS runtime
RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

ARG DBMATE_VERSION=2.36.0
ARG DBMATE_SHA256=47e284b3d8cbad1ba5f090495aa05afd1bbd5f35e2ed5577aad06da74ce780ce
RUN curl -fsSL -o /usr/local/bin/dbmate \
		"https://github.com/amacneil/dbmate/releases/download/v${DBMATE_VERSION}/dbmate-linux-amd64" \
	&& echo "${DBMATE_SHA256}  /usr/local/bin/dbmate" | sha256sum -c - \
	&& chmod +x /usr/local/bin/dbmate

WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node db/migrations db/migrations
COPY --chown=node:node db/schema.sql db/schema.sql

USER node
ENV NODE_ENV=production
EXPOSE 3001

# wget is missing on slim, node already has fetch built in
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
