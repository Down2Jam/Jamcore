# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.14.0
ARG NODE_ENV=development

# --- Base Stage ---
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache postgresql-client
EXPOSE 3005

# --- Dependencies Stage ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    if [ "$NODE_ENV" = "production" ]; then \
      npm ci --omit=dev; \
    else \
      npm ci --include=dev; \
    fi

# --- Builder Stage ---
FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build
RUN chown -R node:node /usr/src/app

# --- Development Final Stage ---
FROM base AS dev
COPY --from=builder /usr/src/app ./
USER node
CMD ["npm", "run", "dev"]

# --- Production Final Stage ---
FROM base AS production
COPY --from=builder /usr/src/app ./
USER node
CMD ["node", "index.js"]