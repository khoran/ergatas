FROM node:lts-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
RUN npm install -g nodemon

ENV COLLECTD_DOCKER_APP=app-unit
ENV COLLECTD_DOCKER_TASK=web

COPY . .
EXPOSE 8080
CMD ["node","server.js"]
