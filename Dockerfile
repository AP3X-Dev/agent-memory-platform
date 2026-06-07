# syntax=docker/dockerfile:1
#
# MemBerry MCP server — multi-stage build.
# Stage 1 (builder) installs the full workspace and compiles every package to
# dist/ (this validates the whole build and emits the .d.ts type outputs), then
# prunes devDependencies. Stage 2 ships node_modules + the workspace and runs the
# server with tsx as a non-root user.
#
# Why tsx and not `node dist`: @memberry/core and @memberry/neo4j share a
# type-level circular dependency, so cross-package runtime resolution is wired
# through src (see each package's "exports"). tsx is the supported runtime and is
# a real (non-dev) dependency, so it survives the prune below.

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root manifests and the lockfile first so layers cache on dependency changes.
COPY package.json package-lock.json ./

# Copy every workspace package manifest BEFORE npm ci so workspaces resolve.
COPY packages/core/package.json packages/core/
COPY packages/redis/package.json packages/redis/
COPY packages/neo4j/package.json packages/neo4j/
COPY packages/mcp/package.json packages/mcp/
COPY packages/research/package.json packages/research/
COPY packages/arch/package.json packages/arch/
COPY packages/code/package.json packages/code/
COPY packages/retrieval/package.json packages/retrieval/
COPY packages/wiki/package.json packages/wiki/
COPY packages/graph/package.json packages/graph/

# Install all dependencies (incl. dev) so the TypeScript build can run.
RUN npm ci

# Bring in the source, build config, and build scripts, then compile to dist/.
COPY packages/ packages/
COPY tsconfig.json tsconfig.build.json ./
COPY scripts/ scripts/
RUN npm run build

# Drop devDependencies now that compilation is done. tsx is a runtime dependency
# (root package.json "dependencies"), so it is retained for the CMD below.
RUN npm prune --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Non-root runtime user.
RUN addgroup -S memberry && adduser -S memberry -G memberry

WORKDIR /app

# Copy the pruned production node_modules and the compiled workspace.
# packages/ carries each package's manifest + dist (source .ts is harmless here).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages

RUN chown -R memberry:memberry /app
USER memberry

EXPOSE 3101
ENV MCP_PORT=3101 \
    NODE_ENV=production

# Liveness probe against the unauthenticated health endpoint. Alpine ships wget;
# fall back to a tiny Node HTTP GET if wget is ever unavailable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${MCP_PORT}/healthz" >/dev/null 2>&1 \
   || node -e "require('http').get('http://127.0.0.1:'+(process.env.MCP_PORT||3101)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "packages/mcp/src/server.ts"]
