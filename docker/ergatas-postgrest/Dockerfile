FROM postgrest/postgrest
#ENV PGRST_DB_URI "postgres://postgrest_auth:jeijbnhl3cchripqpfg3@dev-pg.us-central1-a.c.nomadic-flame-278617.internal:5432/ergatas"
ENV PGRST_DB_URI "postgres://postgrest_auth:jeijbnhl3cchripqpfg3@${DB_URL}:5432/ergatas"
#ENV PGRST_DB_URI "postgres://postgrest_auth:jeijbnhl3cchripqpfg3@10.128.0.3:5432/ergatas"
ENV PGRST_DB_SCHEMA web,grants
ENV PGRST_DB_ANON_ROLE ergatas_web
ENV PGRST_JWT_SECRET 83XV38K6hWRijJ8zWU9k0cqzWGE6s8Oyp0nwCb2hef8=

 
