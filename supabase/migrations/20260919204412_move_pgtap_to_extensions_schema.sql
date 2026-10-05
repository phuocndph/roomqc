-- Keep the test-only pgtap extension out of the exposed public schema.
-- The earlier migration could not move it when the extension was installed
-- later by a local test run, so make the repair idempotent here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgtap' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pgtap SET SCHEMA extensions;
  END IF;
END;
$$;
