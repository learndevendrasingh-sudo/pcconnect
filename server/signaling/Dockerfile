FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY .npmrc ./

# Copy package files for dependency resolution
COPY packages/shared/package.json ./packages/shared/
COPY server/signaling/package.json ./server/signaling/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN pnpm install --frozen-lockfile --filter signaling...

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY server/signaling/ ./server/signaling/
COPY tsconfig.base.json ./

# Build
RUN pnpm --filter signaling build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/server/signaling/dist ./dist
COPY --from=builder /app/server/signaling/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@securedesk/shared/dist

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
