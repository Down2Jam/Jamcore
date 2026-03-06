FROM node:24.14.0-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache postgresql-client

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN chown -R node:node /usr/src/app

EXPOSE 3005

USER node
