ARG NODE_VERSION=20-slim


FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
ENV CI=true
ENV NX_DAEMON=false
COPY . ./
RUN pnpm install --frozen-lockfile --reporter=append-only
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./app/node_modules
COPY --from=build /app/dist ./app

EXPOSE 8081
CMD ["node", "app/main.js"]
