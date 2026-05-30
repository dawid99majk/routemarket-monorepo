FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /usr/src/app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store CI=true pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm --filter @routemarket/atlas-engine build
RUN pnpm deploy --filter=@routemarket/atlas-engine --prod /app --legacy

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app .
# Copy built files and assets explicitly as pnpm deploy may skip them due to .gitignore
COPY --from=build /usr/src/app/apps/atlas-engine/dist ./dist
COPY --from=build /usr/src/app/apps/atlas-engine/docs ./docs

RUN mkdir -p /app/data /app/routes

EXPOSE 8080
CMD ["node", "dist/apps/atlas-engine/apps/api/src/index.js"]
