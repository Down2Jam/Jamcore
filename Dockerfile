# syntax=docker/dockerfile:1

ARG NODE_VERSION=18
ARG NODE_ENV=development

# --- Base Stage ---
FROM node:${NODE_VERSION}-alpine as base
WORKDIR /usr/src/app
# Install common dependencies (e.g. PostgreSQL client)
RUN apk add --no-cache postgresql-client
EXPOSE 3005

# --- Dependencies Stage ---
FROM base as deps
# Copy package files first to leverage caching
COPY package.json package-lock.json ./

# Use cache mount for npm downloads; conditionally install based on NODE_ENV
RUN --mount=type=cache,target=/root/.npm \
    if [ "$NODE_ENV" = "production" ]; then \
      npm ci --omit=dev; \
    else \
      npm ci --include=dev; \
    fi

# --- Builder Stage ---
FROM deps as builder
# Copy the rest of the application code
COPY . .
# Generate Prisma client (or other build steps)
RUN npx prisma generate

# --- Development Final Stage ---
FROM base as dev

COPY --from=builder /usr/src/app ./

CMD ["npm", "run", "dev"]

# --- Production Final Stage ---
FROM base as production

COPY --from=builder /usr/src/app ./

CMD ["node", "index.js"]