FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev --workspaces

FROM node:22-alpine AS runner

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/server/package.json ./server/package.json
COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nodejs:nodejs /app/client/dist ./client/dist

USER nodejs

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "server/dist/server.js"]
