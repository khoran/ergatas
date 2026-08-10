FROM fusionauth/fusionauth-app
EXPOSE 9013
# these should be supplied by docker environment (ie, google or aws)
ENV DATABASE_URL  "jdbc:postgresql://${DB_URL}:5432/fusionauth?ssl=true"
ENV DATABASE_ROOT_USER  ergatas_admin
ENV DATABASE_ROOT_PASSWORD  ${POSTGRES_PASSWORD}
ENV DATABASE_USER  fusionauth
ENV DATABASE_PASSWORD  ${FUSION_DB_PASSWORD}
COPY rds_root_ca.pem /home/fusionauth/.postgresql/root.crt

