# Multi-stage build for the Next.js app.
# Output is `standalone` so the final image is small.
#
# Uses pnpm to match the committed lockfile (web/pnpm-lock.yaml) and the
# project convention (CLAUDE.md). npm's strict peer-dep resolution rejects
# drizzle-orm's optional React Native peers against the React 19 RC pin.

# ── deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat \
 && npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Guarantee /app/public exists even if the source tree didn't ship one
# (git doesn't track empty directories, so fresh clones may lack it).
RUN mkdir -p ./public
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ── runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
