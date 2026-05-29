# Production Dockerfile for RouteMarket Monorepo using pnpm

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
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
COPY packages/export-service/package.json ./packages/export-service/
COPY packages/google-integrations/package.json ./packages/google-integrations/
COPY packages/shared-workflow/package.json ./packages/shared-workflow/

RUN CI=true pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm deploy --filter=@routemarket/atlas-engine --prod /prod --legacy

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Security: Don't run as root
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs

COPY --from=build /prod ./
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/atlas-engine/dist ./dist
COPY --from=build /app/apps/atlas-engine/docs ./docs

# Merge compiled package JS files into node_modules, following symlinks to the virtual store
RUN for pkg in atlas-core atlas-gis atlas-workflow atlas-writer atlas-publisher atlas-research; do \
      if [ -d "/app/node_modules/@routemarket/$pkg" ]; then \
        cp -r /app/dist/packages/$pkg/. /app/node_modules/@routemarket/$pkg/; \
      fi; \
    done

# Create data directories with correct permissions
RUN mkdir -p /app/data /app/routes && chown -R nodejs:nodejs /app/data /app/routes

# Copy healthcheck script
COPY healthcheck.js /app/healthcheck.js

USER nodejs

EXPOSE 8787

# Healthcheck using node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "dist/apps/atlas-engine/apps/api/src/index.js"]
