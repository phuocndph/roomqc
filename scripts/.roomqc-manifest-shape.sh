set -eu
docker exec roomqc-contabo-pilot-db-1 psql -U postgres -d postgres -x -c "select column_name,data_type,column_default from information_schema.columns where table_schema='private' and table_name='roomqc_release_manifest' order by ordinal_position;"
docker exec roomqc-contabo-pilot-db-1 psql -U postgres -d postgres -x -c "select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='private.roomqc_release_manifest'::regclass;"
