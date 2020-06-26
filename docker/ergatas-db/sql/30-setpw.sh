#!/bin/sh
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	ALTER USER postgrest_auth PASSWORD 'md589db895930eefafc34cdf741cad1cbd2';
EOSQL
