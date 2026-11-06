-- Forward-only aggregate commands. Legacy writers remain guarded during caller
-- migration; every writer advances the same private revision. No browser table
-- grant is added and no historical grant/membership is rewritten.
CREATE TABLE private.employee_authority_versions (
  target_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('grants','hotels')),
  version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
  PRIMARY KEY(target_id,kind)
);
CREATE TABLE private.employee_authority_receipts (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  target_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.employee_authority_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.employee_authority_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.employee_authority_versions,private.employee_authority_receipts FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE private.employee_authority_versions IS
  'Editable aggregate revision, including legacy/trusted writers. No cascade FK: deleted identity history is retained; retention needs an operator policy.';
COMMENT ON TABLE private.employee_authority_receipts IS
  'Caller-bound durable command receipts, without tokens. Mutation, revision, activity log and receipt commit together. No cascade FK or implicit retention.';
INSERT INTO private.employee_authority_versions(target_id,kind)
  SELECT u.id,k.kind FROM public.users u CROSS JOIN (VALUES('grants'),('hotels')) k(kind);

CREATE FUNCTION private.initialize_employee_authority_versions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  INSERT INTO private.employee_authority_versions(target_id,kind)
    VALUES(NEW.id,'grants'),(NEW.id,'hotels') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.initialize_employee_authority_versions() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER initialize_employee_authority_versions BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.initialize_employee_authority_versions();

-- A legacy UPDATE has acquired its relation row before its BEFORE ROW trigger.
-- Never wait for a command's revision lock while holding that row: NOWAIT gives
-- a bounded retryable conflict and rolls the entire statement back instead of
-- inverting command(revision -> rows) / legacy(rows -> revision) locks.
CREATE FUNCTION private.advance_employee_authority_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target uuid; v_ids uuid[]; v_kind text;
BEGIN
  v_kind:=CASE TG_TABLE_NAME WHEN 'user_permissions' THEN 'grants' ELSE 'hotels' END;
  v_ids:=CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.user_id] WHEN 'DELETE' THEN ARRAY[OLD.user_id]
    ELSE ARRAY[OLD.user_id,NEW.user_id] END;
  FOR v_target IN SELECT DISTINCT unnest(v_ids) ORDER BY 1 LOOP
    BEGIN
      PERFORM 1 FROM private.employee_authority_versions WHERE target_id=v_target AND kind=v_kind FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_BUSY' USING ERRCODE='PT409';
    END;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_VERSION_MISSING' USING ERRCODE='55000';
    END IF;
    UPDATE private.employee_authority_versions SET version=version+1 WHERE target_id=v_target AND kind=v_kind;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.advance_employee_authority_version() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_employee_authority_version BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION private.advance_employee_authority_version();
CREATE TRIGGER zz_employee_authority_version BEFORE INSERT OR UPDATE OR DELETE ON public.user_hotels
  FOR EACH ROW EXECUTE FUNCTION private.advance_employee_authority_version();

-- Same live authority contract/order as the guarded legacy statement writer.
-- Separate helper lets command/read/result paths lock before target/revision.
CREATE FUNCTION private.lock_employee_authority_actor()
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_auth auth.users%ROWTYPE; v_profile public.users%ROWTYPE;
  v_session auth.sessions%ROWTYPE; v_role text;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' OR v_actor IS NULL
    OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_auth FROM auth.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_auth.deleted_at IS NOT NULL OR v_auth.email_confirmed_at IS NULL
    OR (v_auth.banned_until IS NOT NULL AND v_auth.banned_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_profile FROM public.users WHERE id=v_actor FOR SHARE;
  IF NOT FOUND OR v_profile.tenant_id IS NULL OR v_profile.status IS DISTINCT FROM 'active'
    OR v_profile.deleted_at IS NOT NULL OR COALESCE(v_profile.account_locked,false)
    OR COALESCE(v_profile.is_super_admin,false) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_ACTOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor ORDER BY role FOR SHARE;
  v_role:=CASE v_profile.user_level_code WHEN 'tenant_owner' THEN 'owner'
    WHEN 'manager' THEN 'hotel_manager' WHEN 'department_manager' THEN 'department_manager' END;
  IF v_role IS NULL OR v_profile.role::text IS DISTINCT FROM v_role
    OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role::text=v_role)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role::text='super_admin') THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_session FROM auth.sessions
    WHERE user_id=v_actor AND id::text=auth.jwt()->>'session_id' FOR SHARE;
  IF NOT FOUND OR (v_session.not_after IS NOT NULL AND v_session.not_after<=clock_timestamp()) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_permissions WHERE user_id=v_actor ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code=v_role AND (r.tenant_id=v_profile.tenant_id
      OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      AND p.module='users' AND p.action IN ('update','edit')
    ORDER BY r.id,p.id FOR SHARE OF rp,r,p;
  IF NOT public.has_user_permission(v_actor,'users','update') THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_CAPABILITY_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.user_hotels WHERE user_id=v_actor ORDER BY hotel_id FOR SHARE;
  RETURN v_profile;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_employee_authority_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_employee_authority_target(p_target uuid,p_tenant uuid)
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_target public.users%ROWTYPE;
BEGIN
  -- SHARE, rather than UPDATE, matches the legacy row guard. Revision serializes
  -- aggregate writers; profile/role locks fence hierarchy and hotel transfers.
  SELECT * INTO v_target FROM public.users WHERE id=p_target FOR SHARE;
  PERFORM 1 FROM public.user_roles WHERE user_id=p_target ORDER BY role FOR SHARE;
  IF v_target.id IS NULL OR v_target.tenant_id IS DISTINCT FROM p_tenant
    OR v_target.status IS DISTINCT FROM 'active' OR COALESCE(v_target.account_locked,false)
    OR NOT private.employee_authority_target_allowed(p_target,p_tenant)
    OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
      AND s.id::text=(SELECT auth.jwt()->>'session_id')
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_TARGET_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  RETURN v_target;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_employee_authority_target(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.employee_authority_entries(p_target uuid,p_kind text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT CASE p_kind WHEN 'grants' THEN
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('module',module,'action',action,'enabled',enabled)
      ORDER BY module,action),'[]'::jsonb) FROM public.user_permissions WHERE user_id=p_target)
  WHEN 'hotels' THEN
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('hotel_id',hotel_id,'can_create_managers',can_create_managers,
      'can_create_staff',can_create_staff,'can_view_reports',can_view_reports,
      'can_export_data',can_export_data,'can_approve_requests',can_approve_requests)
      ORDER BY hotel_id),'[]'::jsonb) FROM public.user_hotels WHERE user_id=p_target) END;
$fn$;
REVOKE ALL ON FUNCTION private.employee_authority_entries(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.get_employee_authority_configuration(p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_target public.users%ROWTYPE; v_versions jsonb; v_actions jsonb;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  v_target:=private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  PERFORM 1 FROM private.employee_authority_versions WHERE target_id=p_target_id ORDER BY kind FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_object_agg(kind,version::text) INTO v_versions
    FROM private.employee_authority_versions WHERE target_id=p_target_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('module',catalog.module,'action',catalog.action,
    'custom',EXISTS(SELECT 1 FROM public.user_permissions up WHERE up.user_id=p_target_id
      AND up.module=catalog.module AND up.enabled AND (up.action=catalog.action
        OR (catalog.action='update' AND up.action='edit'))),
    'inherited',EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.code=ur.role::text
      AND (r.tenant_id=v_target.tenant_id OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
      WHERE ur.user_id=p_target_id AND p.module=catalog.module
        AND (p.action=catalog.action OR (catalog.action='update' AND p.action='edit'))),
    'effective',public.has_user_permission(p_target_id,catalog.module,catalog.action))
    ORDER BY catalog.module,catalog.action),'[]'::jsonb) INTO v_actions FROM
    (SELECT DISTINCT module,CASE action WHEN 'edit' THEN 'update' ELSE action END AS action FROM public.permissions) catalog;
  RETURN jsonb_build_object('target_id',p_target_id,'versions',v_versions,'actions',v_actions,
    'grants',private.employee_authority_entries(p_target_id,'grants'),
    'hotels',private.employee_authority_entries(p_target_id,'hotels'),'primary_hotel_id',v_target.hotel_id,
    'semantics','additive');
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_employee_authority_configuration(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_employee_authority_configuration(uuid) TO authenticated;
CREATE FUNCTION public.get_employee_authority_configuration(p_target_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.get_employee_authority_configuration(p_target_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_employee_authority_configuration(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_authority_configuration(uuid) TO authenticated;

CREATE FUNCTION private.replace_employee_authority(
  p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_target public.users%ROWTYPE; v_tenant public.tenants%ROWTYPE;
  v_receipt private.employee_authority_receipts%ROWTYPE; v_entry jsonb; v_entries jsonb; v_payload jsonb;
  v_old jsonb; v_result jsonb; v_version bigint; v_hotel uuid; v_assignment public.user_hotels%ROWTYPE;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  IF p_target_id IS NULL OR p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('grants','hotels')
    OR p_expected_version IS NULL OR p_expected_version !~ '^(0|[1-9][0-9]{0,18})$'
    OR p_entries IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_COMMAND' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_entries)>256 OR octet_length(p_entries::text)>131072 THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_PAYLOAD_TOO_LARGE' USING ERRCODE='22023';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_ENTRY' USING ERRCODE='22023';
    END IF;
    IF p_kind='grants' THEN
      IF (SELECT count(*) FROM jsonb_object_keys(v_entry))<>3
        OR jsonb_typeof(v_entry->'module') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_entry->'action') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_entry->'enabled') IS DISTINCT FROM 'boolean'
        OR NOT EXISTS(SELECT 1 FROM public.permissions p WHERE p.module=v_entry->>'module'
          AND (p.action=v_entry->>'action' OR (p.action IN ('update','edit') AND v_entry->>'action' IN ('update','edit')))) THEN
        RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_GRANT' USING ERRCODE='22023';
      END IF;
      IF (v_entry->>'enabled')::boolean
        AND NOT public.has_user_permission(v_actor.id,v_entry->>'module',v_entry->>'action') THEN
        RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_DELEGATION_NOT_ALLOWED' USING ERRCODE='42501';
      END IF;
    ELSE
      IF (SELECT count(*) FROM jsonb_object_keys(v_entry))<>6
        OR jsonb_typeof(v_entry->'hotel_id') IS DISTINCT FROM 'string'
        OR EXISTS(SELECT 1 FROM unnest(ARRAY['can_create_managers','can_create_staff','can_view_reports',
          'can_export_data','can_approve_requests']) flag WHERE jsonb_typeof(v_entry->flag) IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_INVALID_MEMBERSHIP' USING ERRCODE='22023';
      END IF;
      v_hotel:=(v_entry->>'hotel_id')::uuid;
    END IF;
  END LOOP;
  IF p_kind='grants' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('module',e->>'module','action',
      CASE e->>'action' WHEN 'edit' THEN 'update' ELSE e->>'action' END,'enabled',(e->>'enabled')::boolean)
      ORDER BY e->>'module',CASE e->>'action' WHEN 'edit' THEN 'update' ELSE e->>'action' END),'[]'::jsonb)
      INTO v_entries FROM jsonb_array_elements(p_entries) e;
    IF (SELECT count(*) FROM (SELECT DISTINCT e->>'module',e->>'action' FROM jsonb_array_elements(v_entries) e) d)
      <>jsonb_array_length(v_entries) THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_DUPLICATE_GRANT' USING ERRCODE='22023';
    END IF;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_set(e,'{hotel_id}',to_jsonb((e->>'hotel_id')::uuid))
      ORDER BY (e->>'hotel_id')::uuid),'[]'::jsonb) INTO v_entries
      FROM jsonb_array_elements(p_entries) e;
    IF (SELECT count(DISTINCT (e->>'hotel_id')::uuid) FROM jsonb_array_elements(v_entries) e)<>jsonb_array_length(v_entries) THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_DUPLICATE_MEMBERSHIP' USING ERRCODE='22023';
    END IF;
  END IF;
  v_payload:=jsonb_build_object('target_id',p_target_id,'kind',p_kind,'entries',v_entries,'expected_version',p_expected_version);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor.id::text||':'||p_request_id::text,26145640));
  v_target:=private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  -- Replay is reauthorized against today's actor/target; it does not reveal
  -- another target/actor's receipt or repeat a successful mutation.
  SELECT * INTO v_receipt FROM private.employee_authority_receipts WHERE actor_id=v_actor.id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN v_receipt.result;
  END IF;
  SELECT version INTO v_version FROM private.employee_authority_versions WHERE target_id=p_target_id AND kind=p_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_VERSION_MISSING' USING ERRCODE='55000'; END IF;
  -- Expiry is checked again after request-key/revision lock waits.
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=v_actor.id AND s.id::text=auth.jwt()->>'session_id'
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
    RAISE EXCEPTION 'ACTIVE_EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_version::text IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_STALE_VERSION' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id=v_actor.tenant_id FOR SHARE;
  IF NOT FOUND OR v_tenant.is_read_only IS DISTINCT FROM false
    OR COALESCE(v_tenant.subscription_status,'') NOT IN ('active','trial')
    OR (v_tenant.subscription_status='trial' AND (v_tenant.trial_ends_at IS NULL OR v_tenant.trial_ends_at<=clock_timestamp()))
    OR (v_tenant.subscription_status='active' AND (v_tenant.subscription_end_date IS NULL OR v_tenant.subscription_end_date<current_date)) THEN
    RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_TENANT_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  IF p_kind='hotels' THEN
    IF v_target.hotel_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_entries) e
      WHERE (e->>'hotel_id')::uuid=v_target.hotel_id) THEN
      RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_PRIMARY_HOTEL_REQUIRED' USING ERRCODE='22023';
    END IF;
    FOR v_hotel IN SELECT hotel_id FROM public.user_hotels WHERE user_id=p_target_id
      UNION SELECT (e->>'hotel_id')::uuid FROM jsonb_array_elements(v_entries) e ORDER BY 1 LOOP
      PERFORM 1 FROM public.hotels WHERE id=v_hotel AND tenant_id=v_actor.tenant_id AND status='active' FOR SHARE;
      IF NOT FOUND OR NOT private.employee_hotel_target_allowed(p_target_id,v_hotel) THEN
        RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_HOTEL_NOT_ALLOWED' USING ERRCODE='42501';
      END IF;
      IF v_actor.user_level_code<>'tenant_owner' THEN
        SELECT * INTO v_assignment FROM public.user_hotels WHERE user_id=v_actor.id AND hotel_id=v_hotel FOR SHARE;
        SELECT e INTO v_entry FROM jsonb_array_elements(v_entries) e WHERE (e->>'hotel_id')::uuid=v_hotel;
        IF v_entry IS NOT NULL AND (
          ((v_entry->>'can_create_managers')::boolean AND NOT COALESCE(v_assignment.can_create_managers,false)) OR
          ((v_entry->>'can_create_staff')::boolean AND NOT COALESCE(v_assignment.can_create_staff,false)) OR
          ((v_entry->>'can_view_reports')::boolean AND NOT COALESCE(v_assignment.can_view_reports,false)) OR
          ((v_entry->>'can_export_data')::boolean AND NOT COALESCE(v_assignment.can_export_data,false)) OR
          ((v_entry->>'can_approve_requests')::boolean AND NOT COALESCE(v_assignment.can_approve_requests,false))) THEN
          RAISE EXCEPTION 'EMPLOYEE_AUTHORITY_DELEGATION_NOT_ALLOWED' USING ERRCODE='42501';
        END IF;
      END IF;
    END LOOP;
  END IF;
  v_old:=private.employee_authority_entries(p_target_id,p_kind);
  IF p_kind='grants' THEN
    DELETE FROM public.user_permissions WHERE user_id=p_target_id;
    INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled,created_by)
      SELECT p_target_id,v_actor.tenant_id,e->>'module',e->>'action',(e->>'enabled')::boolean,v_actor.id
      FROM jsonb_array_elements(v_entries) e;
  ELSE
    DELETE FROM public.user_hotels WHERE user_id=p_target_id AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_entries) e WHERE (e->>'hotel_id')::uuid=hotel_id);
    INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by,can_create_managers,can_create_staff,
      can_view_reports,can_export_data,can_approve_requests)
      SELECT p_target_id,(e->>'hotel_id')::uuid,v_actor.id,(e->>'can_create_managers')::boolean,
        (e->>'can_create_staff')::boolean,(e->>'can_view_reports')::boolean,
        (e->>'can_export_data')::boolean,(e->>'can_approve_requests')::boolean FROM jsonb_array_elements(v_entries) e
      ON CONFLICT(user_id,hotel_id) DO UPDATE SET can_create_managers=excluded.can_create_managers,
        can_create_staff=excluded.can_create_staff,can_view_reports=excluded.can_view_reports,
        can_export_data=excluded.can_export_data,can_approve_requests=excluded.can_approve_requests;
  END IF;
  UPDATE private.employee_authority_versions SET version=version+1 WHERE target_id=p_target_id AND kind=p_kind RETURNING version INTO v_version;
  v_result:=jsonb_build_object('state','completed','target_id',p_target_id,'kind',p_kind,'request_id',p_request_id,
    'version',v_version::text,'entries',private.employee_authority_entries(p_target_id,p_kind));
  INSERT INTO public.activity_logs(tenant_id,user_id,user_name,user_role,entity_type,entity_id,entity_name,
    action,description,old_values,new_values) VALUES(v_actor.tenant_id,v_actor.id,v_actor.full_name,v_actor.role,
      'user',p_target_id,v_target.full_name,'update','Cập nhật cấu hình quyền nhân viên',
      jsonb_build_object('kind',p_kind,'entries',v_old),v_result);
  INSERT INTO private.employee_authority_receipts(actor_id,request_id,target_id,tenant_id,payload,result)
    VALUES(v_actor.id,p_request_id,p_target_id,v_actor.tenant_id,v_payload,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.replace_employee_authority(uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.replace_employee_authority(uuid,text,jsonb,text,uuid) TO authenticated;
CREATE FUNCTION public.replace_employee_authority(p_target_id uuid,p_kind text,p_entries jsonb,p_expected_version text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.replace_employee_authority(p_target_id,p_kind,p_entries,p_expected_version,p_request_id);
$fn$;
REVOKE ALL ON FUNCTION public.replace_employee_authority(uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.replace_employee_authority(uuid,text,jsonb,text,uuid) TO authenticated;

CREATE FUNCTION private.get_employee_authority_command_result(p_target_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_result jsonb;
BEGIN
  v_actor:=private.lock_employee_authority_actor();
  PERFORM private.lock_employee_authority_target(p_target_id,v_actor.tenant_id);
  SELECT result INTO v_result FROM private.employee_authority_receipts
    WHERE actor_id=v_actor.id AND request_id=p_request_id AND target_id=p_target_id AND tenant_id=v_actor.tenant_id;
  RETURN COALESCE(v_result,jsonb_build_object('state','not_found'));
END;
$fn$;
REVOKE ALL ON FUNCTION private.get_employee_authority_command_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_employee_authority_command_result(uuid,uuid) TO authenticated;
CREATE FUNCTION public.get_employee_authority_command_result(p_target_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.get_employee_authority_command_result(p_target_id,p_request_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_employee_authority_command_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_authority_command_result(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
