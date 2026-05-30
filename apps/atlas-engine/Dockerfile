# Dockerfile for Atlas Engine using tsx for robust monorepo path resolution
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS runner
WORKDIR /usr/src/app

COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store CI=true pnpm install --no-frozen-lockfile --ignore-scripts

ENV NODE_ENV=production
RUN mkdir -p /usr/src/app/apps/atlas-engine/data /usr/src/app/apps/atlas-engine/routes

EXPOSE 8080
WORKDIR /usr/src/app/apps/atlas-engine
CMD ["npx", "tsx", "apps/api/src/index.ts"]
