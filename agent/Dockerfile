# ---- Base image ----
FROM node:20-alpine AS base

# ---- Install dependencies only when needed ----
FROM base AS deps
RUN apk add --no-cache libc6-compat libstdc++ python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
# Run install scripts and force better-sqlite3 to compile for the container OS/ABI.
# Native binaries copied from another platform or skipped scripts cause runtime restarts.
RUN npm install --no-audit --no-fund && npm rebuild better-sqlite3 --build-from-source

# ---- Build TypeScript source ----
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ============================================================================
# STAGE: tester — chạy vitest, giữ đầy đủ devDeps
# ============================================================================
# Build: docker build --target tester -t ai_social_agent:tester -f agent/Dockerfile agent/.
# Run:   docker run --rm ai_social_agent:tester
# ============================================================================
FROM base AS tester
WORKDIR /app
RUN apk add --no-cache wget libc6-compat libstdc++
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
CMD ["npm", "run", "test"]

# ---- Production runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user for security
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Install wget for Docker HEALTHCHECK and runtime libs required by native deps.
RUN apk add --no-cache wget libc6-compat libstdc++

# Create data directory for SQLite secrets store with correct ownership
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

# Copy only compiled output and the node_modules built inside the Linux image.
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
RUN npm prune --omit=dev

USER appuser

# Health check endpoint port
EXPOSE 4000
ENV HEALTH_PORT=4000

# Use node directly (not npm start) so signals reach the process for graceful shutdown
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
