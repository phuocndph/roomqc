-- Retain compatibility for server-side expiry/recovery, but close the legacy
-- read-only RPC alternative for locked/inactive admins and null Auth sessions.
CREATE OR REPLACE FUNCTION private.assert_entitlement_operator()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF public.rpc_request_is_trusted() THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid())
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid()
       AND status='active' AND NOT COALESCE(account_locked,false)) THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION private.assert_entitlement_operator() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_tenant_read_only(p_tenant_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_prev boolean;
BEGIN
  PERFORM private.assert_entitlement_operator();
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'ADMIN_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT is_read_only INTO v_prev FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  UPDATE public.tenants SET is_read_only=true,read_only_reason=p_reason,
    read_only_since=COALESCE(read_only_since,now()),updated_at=now() WHERE id=p_tenant_id;
  PERFORM public.log_state_transition(p_tenant_id,NULL,'tenants',p_tenant_id,
    'set_read_only',CASE WHEN v_prev THEN 'read_only' ELSE 'active' END,'read_only',
    p_reason,jsonb_build_object('source','set_tenant_read_only'));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.clear_tenant_read_only(p_tenant_id uuid,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_prev boolean;
BEGIN
  PERFORM private.assert_entitlement_operator();
  IF NOT public.rpc_request_is_trusted() AND (p_reason IS NULL OR length(trim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'ADMIN_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT is_read_only INTO v_prev FROM public.tenants WHERE id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  UPDATE public.tenants SET is_read_only=false,read_only_reason=NULL,read_only_since=NULL,updated_at=now()
    WHERE id=p_tenant_id;
  PERFORM public.log_state_transition(p_tenant_id,NULL,'tenants',p_tenant_id,
    'clear_read_only',CASE WHEN v_prev THEN 'read_only' ELSE 'active' END,'active',
    p_reason,jsonb_build_object('source','clear_tenant_read_only'));
END;
$fn$;
REVOKE ALL ON FUNCTION public.set_tenant_read_only(uuid,text),public.clear_tenant_read_only(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_read_only(uuid,text),public.clear_tenant_read_only(uuid,text)
  TO authenticated,service_role;
