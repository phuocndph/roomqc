set -eu
docker exec roomqc-contabo-pilot-db-1 psql -U postgres -d postgres -tAc "select private.roomqc_schema_fingerprint();"
