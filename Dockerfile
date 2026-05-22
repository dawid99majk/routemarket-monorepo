# Production Dockerfile for RouteMarket Monorepo using pnpm

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/atlas-engine/package.json ./apps/atlas-engine/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/atlas-core/package.json ./packages/atlas-core/
COPY packages/atlas-gis/package.json ./packages/atlas-gis/
COPY packages/atlas-research/package.json ./packages/atlas-research/
COPY packages/atlas-workflow/package.json ./packages/atlas-workflow/
COPY packages/atlas-writer/package.json ./packages/atlas-writer/
COPY packages/atlas-publisher/package.json ./packages/atlas-publisher/
COPY packages/atlas-mcp/package.json ./packages/atlas-mcp/
COPY packages/atlas-client/package.json ./packages/atlas-client/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build --filter @routemarket/atlas-engine

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Security: Don't run as root
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs
USER nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/atlas-engine/dist ./apps/atlas-engine/dist
COPY --from=build /app/packages ./packages
COPY package.json ./

# Create data directories with correct permissions
USER root
RUN mkdir -p /app/data /app/routes && chown -R nodejs:nodejs /app/data /app/routes
USER nodejs

EXPOSE 8787

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:8787/health || exit 1

CMD ["node", "apps/atlas-engine/dist/apps/api/src/index.js"]
