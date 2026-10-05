-- ============================================================
-- Phase 1 / Lượt 1: Foundation Hardening Schema (retry)
-- ============================================================

-- 1) Tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_read_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_only_reason text,
  ADD COLUMN IF NOT EXISTS read_only_since timestamptz,
  ADD COLUMN IF NOT EXISTS payment_tolerance_vnd integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS grace_period_days_override integer;

COMMENT ON COLUMN public.tenants.is_read_only IS 'Cờ chỉ đọc — chặn mutation nhạy cảm';
COMMENT ON COLUMN public.tenants.payment_tolerance_vnd IS 'Sai số đối soát SePay (VND), mặc định 1.000đ';

-- 2) Room checks
ALTER TABLE public.room_checks
  ADD COLUMN IF NOT EXISTS check_mode text;

COMMENT ON COLUMN public.room_checks.check_mode IS 'Variant kiểm tra: vip_setup|turndown|deep_clean|inspection|quick';

-- 3) log_state_transition
CREATE OR REPLACE FUNCTION public.log_state_transition(
  p_tenant_id uuid, p_hotel_id uuid, p_table_name text, p_record_id uuid,
  p_action text, p_from_state text, p_to_state text,
  p_reason text DEFAULT NULL, p_context jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_role text; v_actor uuid := auth.uid(); v_payload jsonb;
BEGIN
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  v_payload := COALESCE(p_context, '{}'::jsonb) || jsonb_build_object('reason', p_reason);
  INSERT INTO public.audit_log(
    tenant_id, hotel_id, table_name, record_id, action,
    actor_id, actor_role, old_data, new_data, context
  ) VALUES (
    p_tenant_id, p_hotel_id, p_table_name, p_record_id, p_action,
    v_actor, v_role,
    jsonb_build_object('state', p_from_state),
    jsonb_build_object('state', p_to_state),
    v_payload
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_state_transition(uuid,uuid,text,uuid,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_state_transition(uuid,uuid,text,uuid,text,text,text,text,jsonb) TO authenticated, service_role;

-- 4) is_tenant_read_only
CREATE OR REPLACE FUNCTION public.is_tenant_read_only(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_read_only FROM public.tenants WHERE id = p_tenant_id), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_tenant_read_only(uuid) TO authenticated, service_role;

-- 5) is_super_admin (drop overload cũ trước)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
      FROM pg_proc
     WHERE proname = 'is_super_admin'
       AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role::text = 'super_admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- 6) enforce_read_only_mutation trigger
CREATE OR REPLACE FUNCTION public.enforce_read_only_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    BEGIN v_tenant := (to_jsonb(OLD)->>'tenant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_tenant := NULL; END;
  ELSE
    BEGIN v_tenant := (to_jsonb(NEW)->>'tenant_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_tenant := NULL; END;
  END IF;

  IF v_tenant IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF public.is_tenant_read_only(v_tenant) THEN
    RAISE EXCEPTION 'TENANT_READ_ONLY: Tenant đang ở chế độ chỉ đọc.' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- 7) Gắn trigger
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bookings','payment_transactions','invoices','room_checks',
    'housekeeping_tasks','purchase_orders','laundry_batches',
    'maintenance_requests','inventory_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_read_only ON public.%I;', t);
      EXECUTE format('CREATE TRIGGER trg_enforce_read_only
        BEFORE INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.enforce_read_only_mutation();', t);
    END IF;
  END LOOP;
END $$;

-- 8) set/clear read_only RPC
CREATE OR REPLACE FUNCTION public.set_tenant_read_only(p_tenant_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ super_admin được phép.';
  END IF;
  SELECT is_read_only INTO v_prev FROM public.tenants WHERE id = p_tenant_id;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Tenant % không tồn tại.', p_tenant_id; END IF;
  UPDATE public.tenants SET is_read_only=true, read_only_reason=p_reason,
    read_only_since=COALESCE(read_only_since, now()), updated_at=now()
    WHERE id = p_tenant_id;
  PERFORM public.log_state_transition(p_tenant_id, NULL, 'tenants', p_tenant_id,
    'set_read_only', CASE WHEN v_prev THEN 'read_only' ELSE 'active' END, 'read_only',
    p_reason, jsonb_build_object('source','rpc'));
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_tenant_read_only(p_tenant_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ super_admin được phép.';
  END IF;
  UPDATE public.tenants SET is_read_only=false, read_only_reason=NULL, read_only_since=NULL, updated_at=now()
    WHERE id = p_tenant_id;
  PERFORM public.log_state_transition(p_tenant_id, NULL, 'tenants', p_tenant_id,
    'clear_read_only', 'read_only', 'active', p_reason, jsonb_build_object('source','rpc'));
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_read_only(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_tenant_read_only(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tenant_read_only(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_tenant_read_only(uuid,text) TO authenticated, service_role;

-- 9) Cron auto apply read_only
CREATE OR REPLACE FUNCTION public.auto_apply_read_only_after_grace()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_default_grace integer := 7; v_count integer := 0; r record;
BEGIN
  BEGIN
    SELECT COALESCE((settings->>'grace_period_days')::int, 7) INTO v_default_grace
      FROM public.platform_settings LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_default_grace := 7; END;

  FOR r IN
    SELECT id, COALESCE(grace_period_days_override, v_default_grace) AS grace_days
      FROM public.tenants
     WHERE is_read_only = false
       AND subscription_end_date IS NOT NULL
       AND subscription_end_date < (now() - make_interval(days => COALESCE(grace_period_days_override, v_default_grace)))
  LOOP
    UPDATE public.tenants SET is_read_only=true,
      read_only_reason='Hết ' || r.grace_days || ' ngày ân hạn — chuyển sang chỉ đọc.',
      read_only_since=now(), updated_at=now()
      WHERE id = r.id;
    PERFORM public.log_state_transition(r.id, NULL, 'tenants', r.id,
      'auto_set_read_only','active','read_only','grace_period_expired',
      jsonb_build_object('grace_days', r.grace_days, 'source','cron'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.auto_apply_read_only_after_grace() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-apply-read-only-hourly') THEN
      PERFORM cron.unschedule('auto-apply-read-only-hourly');
    END IF;
    PERFORM cron.schedule('auto-apply-read-only-hourly', '5 * * * *',
      $cron$ SELECT public.auto_apply_read_only_after_grace(); $cron$);
  END IF;
END $$;