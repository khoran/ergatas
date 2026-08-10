FROM  docker.elastic.co/beats/filebeat-oss:7.8.1

LABEL co.elastic.logs/enabled=false

COPY filebeat.yml /usr/share/filebeat/filebeat.yml

ENV COLLECTD_DOCKER_APP=app-unit
ENV COLLECTD_DOCKER_TASK=filebeat

ENTRYPOINT ["filebeat", "-e",  "-strict.perms=false"]
