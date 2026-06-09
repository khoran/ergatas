#!/bin/bash
# Live integration check for the grants record layer against the LOCAL dev stack
# (docker-db-1 + docker-postgrest-1). Wires env from docker/.env, runs the
# checks, then truncates the test rows.
#
# Usage:  ./test/grants/run-integration.sh
set -euo pipefail
cd "$(dirname "$0")/../.."          # repo root

JWT=$(grep -E '^JWT_SECRET=' docker/.env | cut -d= -f2-)
PUSER=$(grep -E '^POSTGRES_USER=' docker/.env | cut -d= -f2-)
PPASS=$(grep -E '^POSTGRES_PASSWORD=' docker/.env | cut -d= -f2-)

export POSTGREST_SERVER_URL_BASE=http://localhost:3001 JWT_SECRET="$JWT" MAINTENANCE_MODE=false

echo "### Phase 0 — record layer"
node test/grants/_integration.mjs
echo
echo "### Phase 1 — OFAC ingest + screening"
node test/grants/_integration-ofac.mjs
echo
echo "### Phase 2 — board review & approval"
node test/grants/_integration-board.mjs
echo
echo "### Phase 3 — agreements + acceptance"
node test/grants/_integration-agreements.mjs
echo
echo "### Phase 4 — salary-use report"
node test/grants/_integration-reports.mjs
echo
echo "### Phase 5 — disbursement + scope enforcement"
node test/grants/_integration-disbursements.mjs

echo "--- cleanup test rows ---"
PGPASSWORD="$PPASS" psql -h localhost -p 5435 -U "$PUSER" -d ergatas -X -q \
    -c "TRUNCATE grants.disbursement, grants.salary_report, grants.ofac_screening, grants.acceptance_record, grants.grant_agreement_version, grants.board_approval,  grants.due_diligence CASCADE;"
#PGPASSWORD="$PPASS" psql -h localhost -p 5435 -U "$PUSER" -d ergatas -X -q \
#        -c "TRUNCATE grants.ofac_list_entries  CASCADE;"
echo "done."
