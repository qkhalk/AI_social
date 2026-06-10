# ---- Base image ----
FROM node:20-alpine AS base

# ---- Install dependencies only when needed ----
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
# Remove --ignore-scripts to allow better-sqlite3 to download/build its binary
RUN npm ci 2>/dev/null || npm install

# ---- Build TypeScript source ----
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---- Production runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user for security
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Install wget for Docker HEALTHCHECK and build tools for native deps
RUN apk add --no-cache wget python3 make g++

# Create data directory for SQLite secrets store with correct ownership
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

# Copy only compiled output and production deps
COPY --from=builder /app/dist ./dist
COPY package.json package-lock.json* ./

# Remove --ignore-scripts so better-sqlite3 can build its native binary
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# We can remove build tools after install to save space
RUN apk del python3 make g++

USER appuser

# Health check endpoint port
EXPOSE 4000
ENV HEALTH_PORT=4000

# Use node directly (not npm start) so signals reach the process for graceful shutdown
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
