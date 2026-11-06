-- Target values are configuration, never authority or recorded revenue.
-- Existing ambiguous NULL-hotel groups are retained for explicit owner review.
ALTER TABLE public.financial_targets ADD COLUMN legacy_review boolean NOT NULL DEFAULT false;
UPDATE public.financial_targets t SET legacy_review=true
WHERE t.hotel_id IS NULL AND EXISTS(
  SELECT 1 FROM public.financial_targets d WHERE d.tenant_id=t.tenant_id
    AND d.hotel_id IS NULL AND d.period_month=t.period_month AND d.metric=t.metric
  GROUP BY d.tenant_id,d.period_month,d.metric HAVING count(*)>1);
CREATE UNIQUE INDEX report_targets_null_hotel_canonical
  ON public.financial_targets(tenant_id,period_month,metric)
  WHERE hotel_id IS NULL AND NOT legacy_review;

CREATE TABLE private.report_target_revisions(
  scope_key text PRIMARY KEY, revision bigint NOT NULL CHECK(revision>0)
);
CREATE TABLE private.report_target_commands(
  actor_id uuid NOT NULL, command_id uuid NOT NULL, tenant_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('financial','monthly')), hotel_id uuid,
  period_month date NOT NULL, request jsonb NOT NULL, previous_rows jsonb NOT NULL,
  result jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,command_id)
);
ALTER TABLE private.report_target_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.report_target_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.report_target_revisions,private.report_target_commands FROM PUBLIC,anon,authenticated,service_role;
-- Public RPCs replace direct browser access; old policies do not grant
-- privileges on their own. Deploy the caller cutover with this migration.
REVOKE ALL ON public.financial_targets,public.monthly_targets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.valid_report_target(p_kind text,p_metric text,p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v numeric;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value)<>'number' THEN RETURN false; END IF;
  v:=(p_value#>>'{}')::numeric;
  IF v<>round(v,2) OR v<-999999999999.99 OR v>999999999999.99 THEN RETURN false; END IF;
  IF p_kind='monthly' THEN
    RETURN (p_metric='revenue_target' AND v>=0 AND v=trunc(v))
      OR(p_metric='occupancy_target' AND v BETWEEN 0 AND 100);
  ELSIF p_kind='financial' THEN
    RETURN CASE p_metric
      WHEN 'occupancy' THEN v BETWEEN 0 AND 100
      WHEN 'gop_margin' THEN v BETWEEN -1000 AND 100
      WHEN 'labor_ratio' THEN v BETWEEN 0 AND 1000
      WHEN 'gop' THEN true WHEN 'goppar' THEN true
      WHEN 'net_revenue' THEN v>=0 WHEN 'adr' THEN v>=0 WHEN 'revpar' THEN v>=0
      ELSE false END;
  END IF;
  RETURN false;
END;
$fn$;
REVOKE ALL ON FUNCTION private.valid_report_target(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_report_target_scope(p_kind text,p_month date,p_hotel uuid,p_write boolean)
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;
BEGIN
  v_actor:=private.lock_booking_finance_reader(false);
  IF p_kind IS NULL OR p_kind NOT IN('financial','monthly') OR p_month IS NULL
    OR p_month<>date_trunc('month',p_month)::date OR p_month<date '1900-01-01'
    OR p_month>date '2100-12-01' OR(p_kind='monthly' AND p_hotel IS NULL) THEN
    RAISE EXCEPTION 'INVALID_REPORT_TARGET_SCOPE' USING ERRCODE='22023'; END IF;
  IF p_write AND NOT(v_actor.role::text='owner' AND v_actor.user_level_code='tenant_owner')
    AND NOT(v_actor.role::text='hotel_manager' AND v_actor.user_level_code IN('manager','hotel_manager')) THEN
    RAISE EXCEPTION 'REPORT_TARGET_MANAGE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_hotel IS NULL THEN
    IF v_actor.role::text<>'owner' OR v_actor.user_level_code<>'tenant_owner' THEN
      RAISE EXCEPTION 'REPORT_TARGET_TENANT_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  ELSE
    PERFORM private.report_assigned_hotels(v_actor,p_hotel);
  END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_report_target_scope(text,date,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.report_target_key(p_tenant uuid,p_kind text,p_month date,p_hotel uuid)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT encode(extensions.digest(jsonb_build_array(p_tenant,p_kind,p_month,p_hotel)::text,'sha256'),'hex');
$fn$;
REVOKE ALL ON FUNCTION private.report_target_key(uuid,text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.report_target_rows(p_tenant uuid,p_kind text,p_month date,p_hotel uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF p_kind='financial' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) INTO v_rows FROM public.financial_targets t
      WHERE t.tenant_id=p_tenant AND t.hotel_id IS NOT DISTINCT FROM p_hotel AND t.period_month=p_month;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) INTO v_rows FROM public.monthly_targets t
      WHERE t.tenant_id=p_tenant AND t.hotel_id=p_hotel AND t.month=p_month;
  END IF;
  RETURN v_rows;
END;
$fn$;
REVOKE ALL ON FUNCTION private.report_target_rows(uuid,text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.report_target_snapshot(p_actor public.users,p_kind text,p_month date,p_hotel uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_rows jsonb:=private.report_target_rows(p_actor.tenant_id,p_kind,p_month,p_hotel);
  v_values jsonb:='{}'::jsonb; v_review boolean:=false; v_revision bigint; v_entry record;
BEGIN
  IF p_kind='financial' THEN
    FOR v_entry IN SELECT r->>'metric' AS metric,count(*) AS n,
      jsonb_agg(r->'target_value')->0 AS value,bool_or(COALESCE((r->>'legacy_review')::boolean,false)) AS marked
      FROM jsonb_array_elements(v_rows) r GROUP BY r->>'metric'
    LOOP
      IF v_entry.n<>1 OR v_entry.marked OR NOT private.valid_report_target(p_kind,v_entry.metric,v_entry.value) THEN
        v_review:=true;
      ELSE v_values:=v_values||jsonb_build_object(v_entry.metric,v_entry.value); END IF;
    END LOOP;
  ELSE
    IF jsonb_array_length(v_rows)>1 THEN v_review:=true;
    ELSE
      FOR v_entry IN SELECT key,value FROM jsonb_each(COALESCE(v_rows->0,'{}'::jsonb))
        WHERE key IN('revenue_target','occupancy_target') AND value<>'null'::jsonb
      LOOP
        IF private.valid_report_target(p_kind,v_entry.key,v_entry.value) THEN
          v_values:=v_values||jsonb_build_object(v_entry.key,v_entry.value);
        ELSE v_review:=true; END IF;
      END LOOP;
    END IF;
  END IF;
  SELECT revision INTO v_revision FROM private.report_target_revisions
    WHERE scope_key=private.report_target_key(p_actor.tenant_id,p_kind,p_month,p_hotel);
  RETURN jsonb_build_object('version',1,'kind',p_kind,'period_month',p_month,'hotel_id',p_hotel,
    'revision',COALESCE(v_revision,0)::text||':'||encode(extensions.digest(v_rows::text,'sha256'),'hex'),
    'values',v_values,'review_required',v_review,
    'can_manage',p_actor.role::text IN('owner','hotel_manager'));
END;
$fn$;
REVOKE ALL ON FUNCTION private.report_target_snapshot(public.users,text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.get_report_targets(p_kind text,p_month date,p_hotel uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_result jsonb;
BEGIN
  v_actor:=private.lock_report_target_scope(p_kind,p_month,p_hotel,false);
  PERFORM pg_advisory_xact_lock(hashtextextended('report-targets:'||private.report_target_key(v_actor.tenant_id,p_kind,p_month,p_hotel),0));
  PERFORM private.assert_room_transition_session();
  v_result:=private.report_target_snapshot(v_actor,p_kind,p_month,p_hotel);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_report_targets(text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_report_targets(text,date,uuid) TO authenticated;
CREATE FUNCTION public.get_report_targets(p_kind text,p_period_month date,p_hotel_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.get_report_targets(p_kind,p_period_month,p_hotel_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_report_targets(text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_report_targets(text,date,uuid) TO authenticated;

CREATE FUNCTION private.replace_report_targets(p_kind text,p_month date,p_hotel uuid,p_values jsonb,
  p_expected text,p_command uuid,p_resolve boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_request jsonb;v_receipt private.report_target_commands%ROWTYPE;
  v_before jsonb;v_result jsonb;v_rows jsonb;v_entry record;v_scope text;
BEGIN
  v_actor:=private.lock_report_target_scope(p_kind,p_month,p_hotel,true);
  IF p_command IS NULL OR p_expected IS NULL OR length(p_expected)>100
    OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR p_resolve IS NULL
    OR(SELECT count(*) FROM jsonb_object_keys(p_values))>8 THEN
    RAISE EXCEPTION 'INVALID_REPORT_TARGET_COMMAND' USING ERRCODE='22023'; END IF;
  FOR v_entry IN SELECT key,value FROM jsonb_each(p_values) LOOP
    IF NOT private.valid_report_target(p_kind,v_entry.key,v_entry.value) THEN
      RAISE EXCEPTION 'INVALID_REPORT_TARGET_VALUE' USING ERRCODE='22023'; END IF;
  END LOOP;
  v_request:=jsonb_build_object('kind',p_kind,'month',p_month,'hotel',p_hotel,'values',p_values,
    'expected_revision',p_expected,'resolve_legacy',p_resolve);
  PERFORM pg_advisory_xact_lock(hashtextextended('report-target-command:'||v_actor.id::text||':'||p_command::text,0));
  v_scope:=private.report_target_key(v_actor.tenant_id,p_kind,p_month,p_hotel);
  PERFORM pg_advisory_xact_lock(hashtextextended('report-targets:'||v_scope,0));
  PERFORM private.assert_room_transition_session();
  SELECT * INTO v_receipt FROM private.report_target_commands WHERE actor_id=v_actor.id AND command_id=p_command;
  IF FOUND THEN
    IF v_receipt.tenant_id<>v_actor.tenant_id OR v_receipt.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'REPORT_TARGET_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN v_receipt.result;
  END IF;
  v_before:=private.report_target_snapshot(v_actor,p_kind,p_month,p_hotel);
  IF v_before->>'revision' IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'REPORT_TARGET_STALE_REVISION' USING ERRCODE='23505'; END IF;
  IF (v_before->>'review_required')::boolean AND NOT(p_resolve AND v_actor.role::text='owner') THEN
    RAISE EXCEPTION 'REPORT_TARGET_REVIEW_REQUIRED' USING ERRCODE='23505'; END IF;
  IF p_resolve AND v_actor.role::text<>'owner' THEN
    RAISE EXCEPTION 'REPORT_TARGET_REVIEW_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  v_rows:=private.report_target_rows(v_actor.tenant_id,p_kind,p_month,p_hotel);
  IF p_kind='financial' THEN
    DELETE FROM public.financial_targets WHERE tenant_id=v_actor.tenant_id
      AND hotel_id IS NOT DISTINCT FROM p_hotel AND period_month=p_month;
    INSERT INTO public.financial_targets(tenant_id,hotel_id,period_month,metric,target_value,created_by,notes)
      SELECT v_actor.tenant_id,p_hotel,p_month,e.key,(e.value#>>'{}')::numeric,v_actor.id,
        CASE WHEN NOT p_resolve THEN (SELECT r->>'notes' FROM jsonb_array_elements(v_rows) r
          WHERE r->>'metric'=e.key AND NOT COALESCE((r->>'legacy_review')::boolean,false) LIMIT 1) END
        FROM jsonb_each(p_values) e;
  ELSE
    DELETE FROM public.monthly_targets WHERE tenant_id=v_actor.tenant_id AND hotel_id=p_hotel AND month=p_month;
    IF p_values<>'{}'::jsonb THEN
      INSERT INTO public.monthly_targets(tenant_id,hotel_id,month,revenue_target,occupancy_target)
        VALUES(v_actor.tenant_id,p_hotel,p_month,(p_values->>'revenue_target')::numeric,(p_values->>'occupancy_target')::numeric);
    END IF;
  END IF;
  INSERT INTO private.report_target_revisions(scope_key,revision) VALUES(v_scope,1)
    ON CONFLICT(scope_key) DO UPDATE SET revision=private.report_target_revisions.revision+1;
  v_result:=jsonb_build_object('state','completed','command_id',p_command,
    'report',private.report_target_snapshot(v_actor,p_kind,p_month,p_hotel));
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,action,description,old_values,new_values)
    VALUES(v_actor.tenant_id,v_actor.id,v_actor.full_name,v_actor.role,'report_targets',COALESCE(p_hotel,v_actor.tenant_id),
      p_kind||':'||p_month::text,'update','Cập nhật mục tiêu báo cáo',v_before,v_result);
  INSERT INTO private.report_target_commands(actor_id,command_id,tenant_id,kind,hotel_id,period_month,request,previous_rows,result)
    VALUES(v_actor.id,p_command,v_actor.tenant_id,p_kind,p_hotel,p_month,v_request,v_rows,v_result);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.replace_report_targets(text,date,uuid,jsonb,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.replace_report_targets(text,date,uuid,jsonb,text,uuid,boolean) TO authenticated;
CREATE FUNCTION public.replace_report_targets(p_kind text,p_period_month date,p_values jsonb,p_expected_revision text,p_command_id uuid,
  p_hotel_id uuid DEFAULT NULL,p_resolve_legacy boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.replace_report_targets(p_kind,p_period_month,p_hotel_id,p_values,p_expected_revision,p_command_id,p_resolve_legacy);
$fn$;
REVOKE ALL ON FUNCTION public.replace_report_targets(text,date,jsonb,text,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.replace_report_targets(text,date,jsonb,text,uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION private.get_report_target_command(p_command uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_receipt private.report_target_commands%ROWTYPE;v_found boolean;
BEGIN
  v_actor:=private.lock_booking_finance_reader(false);
  IF v_actor.role::text NOT IN('owner','hotel_manager') OR p_command IS NULL THEN
    RAISE EXCEPTION 'REPORT_TARGET_MANAGE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_receipt FROM private.report_target_commands WHERE actor_id=v_actor.id AND command_id=p_command;
  IF FOUND THEN
    PERFORM private.lock_report_target_scope(v_receipt.kind,v_receipt.period_month,v_receipt.hotel_id,true);
    IF v_receipt.tenant_id<>v_actor.tenant_id THEN
      RAISE EXCEPTION 'REPORT_TARGET_MANAGE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('report-target-command:'||v_actor.id::text||':'||p_command::text,0));
  SELECT * INTO v_receipt FROM private.report_target_commands WHERE actor_id=v_actor.id AND command_id=p_command;
  v_found:=FOUND;
  PERFORM private.assert_room_transition_session();
  IF NOT v_found THEN RETURN jsonb_build_object('state','not_found','command_id',p_command); END IF;
  PERFORM private.lock_report_target_scope(v_receipt.kind,v_receipt.period_month,v_receipt.hotel_id,true);
  RETURN v_receipt.result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_report_target_command(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_report_target_command(uuid) TO authenticated;
CREATE FUNCTION public.get_report_target_command(p_command_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.get_report_target_command(p_command_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_report_target_command(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_report_target_command(uuid) TO authenticated;
