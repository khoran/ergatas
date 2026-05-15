FROM node:26-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
RUN npm install -g nodemon

ENV COLLECTD_DOCKER_APP=app-unit
ENV COLLECTD_DOCKER_TASK=web

COPY . .
EXPOSE 8080

#for development - DON'T COMMIT WITH THIS UNCOMMENTED!
#CMD ["npm","run","dev:server"]  

#for production
CMD ["node","server.js"]
