-- Platform metadata only. Invoker trigger: no new role or SECURITY DEFINER.
-- Missing actual subscriber key means 4 in the pinned vendor; null/false means 1.
DO $install$
DECLARE
  body constant text := $body$
DECLARE
  connect_pool jsonb;
  subscriber_pool jsonb;
BEGIN
  IF NEW.type <> 'postgres_cdc_rls' THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ROOMQC_REALTIME_POOL_SETTINGS_INVALID' USING ERRCODE = '22023';
  END IF;
  connect_pool := NEW.settings->'db_pool';
  IF connect_pool IS NULL OR connect_pool IN ('null'::jsonb, 'false'::jsonb) THEN connect_pool := '1'::jsonb; END IF;
  IF NOT (NEW.settings ? 'subcriber_pool_size') THEN subscriber_pool := '4'::jsonb;
  ELSE
    subscriber_pool := NEW.settings->'subcriber_pool_size';
    IF subscriber_pool IN ('null'::jsonb, 'false'::jsonb) THEN subscriber_pool := '1'::jsonb; END IF;
  END IF;
  IF jsonb_typeof(connect_pool) IS DISTINCT FROM 'number'
    OR jsonb_typeof(subscriber_pool) IS DISTINCT FROM 'number'
    OR connect_pool::text !~ '^([1-9][0-9]{0,3}|10000)$'
    OR subscriber_pool::text !~ '^([1-9][0-9]{0,3}|10000)$' THEN
    RAISE EXCEPTION 'ROOMQC_REALTIME_POOL_SETTINGS_INVALID' USING ERRCODE = '22023';
  END IF;
  NEW.settings := NEW.settings || jsonb_build_object('db_pool', connect_pool,
    'subcriber_pool_size', subscriber_pool, 'subs_pool_size', subscriber_pool);
  RETURN NEW;
END
$body$;
  function_id oid;
BEGIN
  function_id := to_regprocedure('_realtime.roomqc_pool_guard_v1()');
  IF function_id IS NULL THEN
    EXECUTE format('CREATE FUNCTION _realtime.roomqc_pool_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS %L', body);
    REVOKE ALL ON FUNCTION _realtime.roomqc_pool_guard_v1() FROM PUBLIC;
    function_id := to_regprocedure('_realtime.roomqc_pool_guard_v1()');
  ELSIF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=function_id AND p.prosrc=body AND NOT p.prosecdef AND l.lanname='plpgsql'
      AND p.prorettype='trigger'::regtype AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
    RAISE EXCEPTION 'ROOMQC_REALTIME_GUARD_DEFINITION_MISMATCH';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='_realtime.extensions'::regclass
    AND tgname='roomqc_pool_guard_v1') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='_realtime.extensions'::regclass
      AND tgname='roomqc_pool_guard_v1' AND tgfoid=function_id AND tgtype=23 AND tgenabled='O'
      AND NOT tgisinternal AND tgnargs=0 AND tgattr::text='' AND tgqual IS NULL AND tgconstraint=0) THEN
      RAISE EXCEPTION 'ROOMQC_REALTIME_GUARD_DEFINITION_MISMATCH';
    END IF;
  ELSE
    CREATE TRIGGER roomqc_pool_guard_v1 BEFORE INSERT OR UPDATE ON _realtime.extensions
      FOR EACH ROW EXECUTE FUNCTION _realtime.roomqc_pool_guard_v1();
  END IF;
END
$install$;
