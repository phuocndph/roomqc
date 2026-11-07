set -eu
docker exec roomqc-contabo-pilot-db-1 psql -U postgres -d postgres -tAc "set role roomqc_control_probe; select public.control_cluster_manifest('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');"
