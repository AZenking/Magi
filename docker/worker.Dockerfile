FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /root/.cache/node/corepack /root/.cache/node/corepack
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/worker ./apps/worker
COPY packages ./packages
COPY scripts/resolve-worker-aliases.mjs ./scripts/resolve-worker-aliases.mjs
RUN pnpm --filter @magi/types --filter @magi/backend-core --filter @magi/utils build && \
    pnpm --filter @magi/worker build

FROM base AS prod-deps
COPY --from=deps /root/.cache/node/corepack /root/.cache/node/corepack
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --prod --filter @magi/worker... && \
    rm -rf /app/node_modules/.pnpm/@next* /app/node_modules/.pnpm/next* \
            /app/node_modules/.pnpm/@rolldown* /app/node_modules/.pnpm/sharp* \
            /app/node_modules/.pnpm/@img* /app/node_modules/.pnpm/esbuild* \
            /app/node_modules/.pnpm/lightningcss* /app/node_modules/.pnpm/drizzle-kit* \
            /app/node_modules/.pnpm/prettier* /app/node_modules/.pnpm/webpack*

FROM base AS runner
ARG APP_VERSION=unknown
ENV NODE_ENV=production
LABEL org.opencontainers.image.version="${APP_VERSION}"
RUN apk add --no-cache ffmpeg
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/backend-core/dist ./packages/backend-core/dist
COPY --from=builder /app/packages/backend-core/package.json ./packages/backend-core/package.json
COPY --from=builder /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder /app/packages/utils/package.json ./packages/utils/package.json
COPY --from=builder /app/apps/worker/package.json ./

CMD ["node", "dist/main.js"]
