-- A service-only enqueue RPC is also reachable through this profile trigger.
-- Keep the initial owner INSERT valid before user_roles/user_hotels are added,
-- but fail closed for stale/ineligible profiles and wrong recipient/scope.
CREATE OR REPLACE FUNCTION private.queue_owner_workspace_ready() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_hotel text; v_email text; v_slug text; v_path text; v_provisioning boolean;
BEGIN
  IF NEW.user_level_code IS DISTINCT FROM 'tenant_owner'
    OR NEW.status IS DISTINCT FROM 'active' OR NEW.role::text IS DISTINCT FROM 'owner'
    OR NEW.is_primary_owner IS DISTINCT FROM true OR COALESCE(NEW.is_super_admin,false)
    OR COALESCE(NEW.account_locked,false) OR NEW.deleted_at IS NOT NULL
    OR NEW.tenant_id IS NULL OR NEW.hotel_id IS NULL THEN RETURN NEW; END IF;

  SELECT lower(trim(a.email)) INTO v_email FROM auth.users a
    WHERE a.id=NEW.id AND a.email_confirmed_at IS NOT NULL AND a.deleted_at IS NULL
      AND (a.banned_until IS NULL OR a.banned_until<=now())
      AND lower(trim(a.email))=lower(trim(NEW.email));
  IF NOT FOUND OR v_email IS NULL THEN RETURN NEW; END IF;

  -- Only guarded registration entry points set these transaction-local markers.
  -- They are not a replacement for a live caller/session check at those roots.
  v_provisioning:=COALESCE(current_setting('roomqc.registration_provisioning',true)='true',false)
    AND current_setting('roomqc.registration_user_id',true)=NEW.id::text
    AND (auth.uid()=NEW.id OR COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.jwt()->>'role','')='service_role');
  IF NOT COALESCE(v_provisioning,false)
    AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.id AND role::text='owner') THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.id AND role::text<>'owner')
    OR EXISTS(SELECT 1 FROM public.staff_invitations WHERE auth_user_id=NEW.id AND status<>'accepted') THEN RETURN NEW; END IF;

  SELECT h.name INTO v_hotel FROM public.hotels h JOIN public.tenants t ON t.id=h.tenant_id
    WHERE h.id=NEW.hotel_id AND h.tenant_id=NEW.tenant_id AND h.status='active'
      AND lower(trim(t.email))=v_email;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_slug:=current_setting('roomqc.email_workspace_slug',true);
  v_path:=CASE WHEN COALESCE(v_slug,'') ~ '^[a-z0-9][a-z0-9-]{1,62}$'
    THEN '/app/'||v_slug||'/auth/login' ELSE '/auth/login' END;
  PERFORM public.enqueue_roomqc_email('workspace-ready:'||NEW.tenant_id::text,NEW.tenant_id,v_email,'workspace_ready',
    jsonb_build_object('name',NEW.full_name,'hotel_name',v_hotel,'path',v_path));
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.queue_owner_workspace_ready() FROM PUBLIC,anon,authenticated,service_role;
