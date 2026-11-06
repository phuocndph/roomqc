-- Storage API v1.82.1 writes the current object using
-- ON CONFLICT (bucket_id, name COLLATE "C") WHERE archived_at IS NULL.
-- Some local upgrades retain a current-version unique index on name's default
-- collation, which PostgreSQL cannot infer for that conflict target (42P10).
-- Add only a compatibility index when the vendor query cannot be planned.
-- Do not rewrite vendor indexes, columns, migration history or object metadata.
-- LOCAL MAINTENANCE ONLY: run as the existing Storage owner, outside app
-- migrations. repair-local-storage.mjs verifies the local, empty-table target.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $compat$
DECLARE
  v_plan text := $plan$
    EXPLAIN INSERT INTO storage.objects(bucket_id,name)
    VALUES ('roomqc-plan-only','roomqc-plan-only')
    ON CONFLICT (bucket_id,name COLLATE "C") WHERE archived_at IS NULL DO NOTHING
  $plan$;
BEGIN
  -- Older Storage versions do not have versioning/current-object writes.
  -- This repair must run after vendor versioning migrations on v1.82.x.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid=pg_catalog.to_regclass('storage.objects')
      AND attname='archived_at' AND NOT attisdropped) THEN
    RETURN;
  END IF;
  BEGIN
    -- EXPLAIN without ANALYZE: no row or object is ever inserted.
    EXECUTE v_plan;
  EXCEPTION WHEN invalid_column_reference THEN
    -- Protect the empty-table check against an upload racing the wrapper.
    LOCK TABLE storage.objects IN SHARE MODE;
    IF EXISTS (SELECT 1 FROM storage.objects) THEN
      RAISE EXCEPTION 'Local repair refuses populated Storage';
    END IF;
    CREATE UNIQUE INDEX IF NOT EXISTS roomqc_storage_current_name_c_idx
      ON storage.objects(bucket_id,name COLLATE "C") WHERE archived_at IS NULL;
    COMMENT ON INDEX storage.roomqc_storage_current_name_c_idx IS
      'Compatibility for Storage current-object ON CONFLICT using name COLLATE C; retain vendor constraints and policies.';
    EXECUTE v_plan; -- fail, rather than record a successful but ineffective fix
  END;
END;
$compat$;
COMMIT;
