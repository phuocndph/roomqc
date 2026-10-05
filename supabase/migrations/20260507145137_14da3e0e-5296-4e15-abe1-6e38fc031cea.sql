
DO $$
DECLARE
  v_tenant uuid;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT tenant_id FROM public.items WHERE asset_group IS NULL
  LOOP
    BEGIN
      PERFORM public.apply_asset_group_mapping(v_tenant, NULL, false);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Backfill failed for tenant %: %', v_tenant, SQLERRM;
    END;
  END LOOP;
END $$;
