# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 -- build the client bundle and the server bundle
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# `npm run build` = vite build (client) + esbuild server.ts (server bundle).
RUN npm run build

# Drop dev dependencies from the node_modules we are about to copy forward.
RUN npm prune --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2 -- runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    # Cloud Run injects $PORT; keep 8080 as the local default.
    NODE_OPTIONS="--enable-source-maps"

WORKDIR /app

# Run as an unprivileged user. The official node image ships one already.
USER node

# Only what the server needs at runtime: the bundles, prod node_modules, and
# the source files the server bundle imports at runtime (none -- it is bundled).
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

EXPOSE 8080

# Liveness only: the process answering HTTP at all means it is alive.
# Readiness is /api/ready, which also checks that the API key is configured.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# exec form: node runs as PID 1 and receives SIGTERM directly, which is what
# the graceful shutdown handler in server/operations.ts listens for.
CMD ["node", "dist/server.cjs"]
