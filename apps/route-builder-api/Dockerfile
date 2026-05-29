# Dockerfile for Route Builder API v2
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# In MVP v2 we might need packages, so copy all workspace for now
COPY . .
RUN CI=true pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm -C apps/route-builder-api run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/route-builder-api ./apps/route-builder-api
COPY --from=build /app/packages ./packages

EXPOSE 8081
WORKDIR /app/apps/route-builder-api
CMD ["node", "dist/index.js"]
