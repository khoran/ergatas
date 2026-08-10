# syntax=docker/dockerfile:1

# ---------- shared base ----------
FROM node:26-alpine AS base
WORKDIR /usr/src/app
ENV COLLECTD_DOCKER_APP=app-unit
ENV COLLECTD_DOCKER_TASK=web
COPY package*.json ./

# ---------- development ----------
# Build with:  docker build --target development -t ergatas-web .
# Used with docker-compose (bind-mounts the repo over /usr/src/app); nodemon auto-reloads.
FROM base AS development
ENV NODE_ENV=development
RUN npm install && npm install -g nodemon
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev:server"]

# ---------- production (default target) ----------
# Build with:  docker build -t ergatas-web .    (deployment / staging / production branches)
FROM base AS production
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
