set -eu
docker exec roomqc-contabo-pilot-db-1 psql -U postgres -d postgres -tAc "select count(*) from supabase_migrations.schema_migrations;"
docker exec roomqc-contabo-pilot-db-1 psql -U postgres -d postgres -tAc "select to_regprocedure('public.control_cluster_manifest(text)');"
