FROM elasticsearch:7.8.1

EXPOSE 9200/tcp

ENV discovery.type=single-node
ENV ES_JAVA_OPTS="-Xmx512m -Xms512m"
ENV COLLECTD_DOCKER_APP=es
ENV COLLECTD_DOCKER_TASK=elasticsearch
												 
HEALTHCHECK CMD curl -s -f http://localhost:9200/_cat/health
