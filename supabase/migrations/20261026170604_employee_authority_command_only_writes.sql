-- Browser writers now use the aggregate authority commands. Keep SELECT/RLS
-- compatibility, but require one guarded command for mutation+audit+receipt.
-- Trusted registration, invitation and profile functions retain their existing
-- definer privileges; service_role is deliberately not changed by this patch.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON TABLE public.user_permissions,public.user_hotels
  FROM PUBLIC,anon,authenticated;

-- Revoking a table privilege does not revoke grants on individual columns.
-- Close those independently, including historical grants not used by today's
-- browser callers. Never alter grants on unrelated relations or runtime roles.
DO $migration$
DECLARE v_table text; v_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['user_permissions','user_hotels'] LOOP
    SELECT string_agg(pg_catalog.quote_ident(a.attname),',' ORDER BY a.attnum)
      INTO v_columns FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=pg_catalog.to_regclass('public.'||v_table)
        AND a.attnum>0 AND NOT a.attisdropped;
    EXECUTE pg_catalog.format(
      'REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',
      v_columns,v_columns,v_columns,v_table);
    IF current_setting('server_version_num')::integer>=170000 THEN
      EXECUTE pg_catalog.format(
        'REVOKE MAINTAIN ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    END IF;
  END LOOP;
END;
$migration$;

NOTIFY pgrst,'reload schema';
