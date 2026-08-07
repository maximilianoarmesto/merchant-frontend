# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS deps
WORKDIR /app
# better-sqlite3 ships a linuxmusl prebuild in its tarball, so alpine needs no
# toolchain here. Add python3/make/g++ if that ever stops being true.
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are baked in at build time. Build-args let compose pass them in.
ARG NEXT_PUBLIC_CATALOG_API_URL
ARG NEXT_PUBLIC_CHECKOUT_API_URL
ENV NEXT_PUBLIC_CATALOG_API_URL=${NEXT_PUBLIC_CATALOG_API_URL}
ENV NEXT_PUBLIC_CHECKOUT_API_URL=${NEXT_PUBLIC_CHECKOUT_API_URL}
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    PROVIDER_CONFIG_DB_PATH=/app/data/merchant.db
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Mount a volume here to keep merchant provider configs across restarts.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
