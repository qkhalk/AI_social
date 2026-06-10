# ---- Base image ----
FROM node:20-alpine AS base

# ---- Install dependencies only when needed ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts

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

# Install wget for Docker HEALTHCHECK (alpine has no curl by default)
RUN apk add --no-cache wget

# Copy only compiled output and production deps
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts

USER appuser

# Health check endpoint port
EXPOSE 4000
ENV HEALTH_PORT=4000

# Use node directly (not npm start) so signals reach the process for graceful shutdown
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
