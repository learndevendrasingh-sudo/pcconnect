FROM node:20-alpine

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

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node_modules/.bin/tsx", "server/signaling/src/index.ts"]
