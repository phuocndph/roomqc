-- Cover foreign-key columns used by tenant joins and delete/update checks.
-- The guard skips indexes that already cover the FK column prefix.
DO $$
DECLARE
  foreign_key record;
  index_name text;
BEGIN
  FOR foreign_key IN
    SELECT
      ns.nspname AS schema_name,
      tbl.relname AS table_name,
      con.conname AS constraint_name,
      string_agg(format('%I', att.attname), ', ' ORDER BY key_columns.ordinality) AS column_list
    FROM pg_constraint con
    JOIN pg_class tbl ON tbl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = key_columns.attnum
    WHERE con.contype = 'f'
      AND ns.nspname IN ('public', 'private')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index existing_index
        WHERE existing_index.indrelid = con.conrelid
          AND existing_index.indisvalid
          AND existing_index.indpred IS NULL
          AND existing_index.indexprs IS NULL
          AND (
            existing_index.indkey::smallint[]
          )[0:array_length(con.conkey, 1) - 1] = con.conkey
      )
    GROUP BY ns.nspname, tbl.relname, con.conname, con.conkey
  LOOP
    index_name := left(
      'idx_' || foreign_key.table_name || '_' || foreign_key.constraint_name,
      52
    ) || '_' || substr(
      md5(foreign_key.schema_name || '.' || foreign_key.table_name || '.' || foreign_key.constraint_name),
      1,
      10
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      index_name,
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.column_list
    );
  END LOOP;
END;
$$;
