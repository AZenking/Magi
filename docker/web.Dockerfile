FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN pnpm --filter @magi/types --filter @magi/utils build && \
    pnpm --filter @magi/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/dist ./dist
COPY --from=builder /app/apps/web/node_modules ./node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/package.json ./

EXPOSE 3000
CMD ["node", "dist/server/server.js"]
