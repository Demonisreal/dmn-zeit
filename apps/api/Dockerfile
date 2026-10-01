# syntax=docker/dockerfile:1.7
# node:24-slim, checked with `docker pull node:24-slim` on 2026-09-25 (v24.21.0)
FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
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

FROM node:24-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime

ARG DBMATE_VERSION=2.36.0
# ADD verifies the checksum itself, no curl/ca-certificates needed in the final image for this
ADD --checksum=sha256:47e284b3d8cbad1ba5f090495aa05afd1bbd5f35e2ed5577aad06da74ce780ce \
	https://github.com/amacneil/dbmate/releases/download/v${DBMATE_VERSION}/dbmate-linux-amd64 /usr/local/bin/dbmate
RUN chmod +x /usr/local/bin/dbmate

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
