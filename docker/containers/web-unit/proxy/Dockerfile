FROM nginx:mainline-alpine

EXPOSE 80/tcp
EXPOSE 443/tcp

COPY default.conf /etc/nginx/conf.d/
COPY ergatas.org /etc/nginx/conf.d/ergatas.org.conf
COPY fullchain.pem /etc/nginx/certs/
COPY privkey.pem /etc/nginx/certs/

RUN chmod 500 /etc/nginx/certs/privkey.pem /etc/nginx/certs/fullchain.pem

ENV COLLECTD_DOCKER_APP=app-unit
ENV COLLECTD_DOCKER_TASK=proxy

LABEL co.elastic.logs/module=nginx
LABEL co.elastic.logs/fileset.stdout=access
LABEL co.elastic.logs/fileset.stderr=error
LABEL co.elastic.metrics/module=nginx
LABEL co.elastic.metrics/metricsets=status



