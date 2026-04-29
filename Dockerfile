# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.14.0

# --- Base Stage ---
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache postgresql-client
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=development
EXPOSE 3005

# --- Dependencies Stage ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# --- Builder Stage ---
FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Development Final Stage ---
FROM base AS dev
ENV NODE_ENV=development
COPY --chown=node:node --from=builder /usr/src/app ./
USER node
CMD ["npm", "run", "dev"]

# --- Production Final Stage ---
FROM base AS production
ENV NODE_ENV=production
COPY --chown=node:node --from=builder /usr/src/app ./
RUN npm prune --omit=dev \
    && npm cache clean --force \
    && mkdir -p logs .jamcore public/images \
    && chown -R node:node logs .jamcore public/images
USER node
CMD ["npm", "start"]
