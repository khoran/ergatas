FROM node:lts-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
RUN npm install -g nodemon

COPY . .
EXPOSE 8080
#CMD ["node","server.js"]
CMD ["npm","run","dev:server"]
