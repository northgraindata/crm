FROM node:24-bookworm-slim AS base

RUN npm install --global bun@1.3.12

FROM base AS build

WORKDIR /app

COPY . .

ARG API_URL=http://api:3001
ARG AGENT_URL=http://agent:2000
ARG NEXT_PUBLIC_API_URL=http://localhost:3001

ENV NODE_ENV=production \
    DATABASE_URL=postgresql://crm:build@127.0.0.1:5432/crm?schema=public \
    BETTER_AUTH_SECRET=build-only-secret-with-at-least-32-characters \
    ALLOWED_SIGN_IN=build.invalid \
    API_URL=${API_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_API_URL=${API_URL} \
    APP_URL=http://127.0.0.1:3000 \
    AGENT_URL=${AGENT_URL} \
    OPENROUTER_API_KEY=build-only

RUN bun install --frozen-lockfile
RUN bun run db:generate
RUN bun run --filter=api build
RUN bun run --filter=agent build
RUN bun run --filter=app build

FROM base AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build --chown=node:node /app /app

USER node
