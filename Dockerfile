# syntax=docker/dockerfile:1
ARG NODE_VERSION=20

# 1) deps (to cache node_modules)
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2) build (uses full deps)
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV CI=true
ENV NX_DAEMON=false
COPY . ./
COPY --from=deps /app/node_modules ./node_modules
RUN pnpm build

# 3) prod-deps (only production deps)
FROM node:${NODE_VERSION}-slim AS prod-deps
WORKDIR /app
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 4) runner (Debian slim -> use apt, not apk)
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app

# tzdata on Debian/Ubuntu:
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Kuala_Lumpur
ENV NODE_ENV=production

# Copy only what we need
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# (optional) drop privileges
USER node

EXPOSE 8081
CMD ["node", "dist/main.js"]
