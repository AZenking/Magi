FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/backend-core/package.json packages/backend-core/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm --filter @magi/types --filter @magi/backend-core --filter @magi/utils build && \
    pnpm --filter @magi/api build

FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/backend-core/package.json packages/backend-core/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @magi/api... && \
    rm -rf /app/node_modules/.pnpm/@next* /app/node_modules/.pnpm/next* \
            /app/node_modules/.pnpm/@rolldown* /app/node_modules/.pnpm/sharp* \
            /app/node_modules/.pnpm/@img* /app/node_modules/.pnpm/esbuild* \
            /app/node_modules/.pnpm/lightningcss* /app/node_modules/.pnpm/drizzle-kit* \
            /app/node_modules/.pnpm/prettier* /app/node_modules/.pnpm/webpack*

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/backend-core/dist ./packages/backend-core/dist
COPY --from=builder /app/packages/backend-core/package.json ./packages/backend-core/package.json
COPY --from=builder /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder /app/packages/utils/package.json ./packages/utils/package.json
COPY --from=builder /app/apps/api/package.json ./

EXPOSE 3001
CMD ["node", "dist/main.js"]
