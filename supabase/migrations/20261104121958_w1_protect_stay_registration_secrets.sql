-- W1/F258: keep stay-registration credentials out of ordinary hotel rows.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.hotel_tbltkbtt_credentials (
  hotel_id uuid PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  endpoint_url text,
  account text,
  token text,
  establishment_code text,
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('live','dry_run')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE private.hotel_tbltkbtt_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.hotel_tbltkbtt_credentials FROM PUBLIC, anon, authenticated;

INSERT INTO private.hotel_tbltkbtt_credentials(
  hotel_id,tenant_id,enabled,endpoint_url,account,token,establishment_code,mode
)
SELECT h.id,h.tenant_id,coalesce((h.tbltkbtt_config->>'enabled')::boolean,false),
  h.tbltkbtt_config->>'endpoint_url',h.tbltkbtt_config->>'account',
  h.tbltkbtt_config->>'token',h.tbltkbtt_config->>'establishment_code',
  coalesce(h.tbltkbtt_config->>'mode','dry_run')
FROM public.hotels h WHERE h.tbltkbtt_config <> '{}'::jsonb
ON CONFLICT(hotel_id) DO UPDATE SET
  tenant_id=excluded.tenant_id,enabled=excluded.enabled,
  endpoint_url=coalesce(excluded.endpoint_url,private.hotel_tbltkbtt_credentials.endpoint_url),
  account=coalesce(excluded.account,private.hotel_tbltkbtt_credentials.account),
  token=coalesce(excluded.token,private.hotel_tbltkbtt_credentials.token),
  establishment_code=coalesce(excluded.establishment_code,private.hotel_tbltkbtt_credentials.establishment_code),
  mode=excluded.mode,updated_at=now();

CREATE OR REPLACE FUNCTION private.hotel_tbltkbtt_safe(p_hotel_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('enabled',coalesce(c.enabled,false),'endpoint_url',c.endpoint_url,
    'establishment_code',c.establishment_code,'mode',coalesce(c.mode,'dry_run'),
    'account_configured',(c.account is not null and c.account<>''),
    'token_configured',(c.token is not null and c.token<>''),'updated_at',c.updated_at)
  FROM private.hotel_tbltkbtt_credentials c
  WHERE c.hotel_id=p_hotel_id AND c.tenant_id=public.get_current_user_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.get_tbltkbtt_safe_config(p_hotel_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb; v_tenant uuid; v_actor uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.hotels WHERE id=p_hotel_id;
  IF public.rpc_request_is_trusted() THEN v_actor:=auth.uid();
  ELSE
    IF NOT private.business_actor_is_live() THEN RAISE EXCEPTION 'ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
    v_actor:=public.assert_rpc_actor(v_tenant,p_hotel_id);
    IF NOT public.has_user_permission(v_actor,'settings','manage') THEN RAISE EXCEPTION 'SETTINGS_MANAGE_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT private.hotel_tbltkbtt_safe(p_hotel_id) INTO v; RETURN coalesce(v,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.get_tbltkbtt_worker_config(p_hotel_ids uuid[])
RETURNS TABLE(hotel_id uuid,tbltkbtt_config jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.rpc_request_is_trusted() THEN RAISE EXCEPTION 'SERVER_WORKER_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT c.hotel_id,jsonb_build_object('enabled',c.enabled,'endpoint_url',c.endpoint_url,
    'account',c.account,'token',c.token,'establishment_code',c.establishment_code,'mode',c.mode)
  FROM private.hotel_tbltkbtt_credentials c WHERE c.hotel_id=ANY(p_hotel_ids);
END; $$;

CREATE OR REPLACE FUNCTION public.save_tbltkbtt_config(p_hotel_id uuid,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant uuid; v_actor uuid; v_old private.hotel_tbltkbtt_credentials%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.hotels WHERE id=p_hotel_id;
  IF public.rpc_request_is_trusted() THEN v_actor:=auth.uid();
  ELSE
    IF NOT private.business_actor_is_live() THEN RAISE EXCEPTION 'ACTIVE_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
    v_actor:=public.assert_rpc_actor(v_tenant,p_hotel_id);
    IF NOT public.has_user_permission(v_actor,'settings','manage') THEN RAISE EXCEPTION 'SETTINGS_MANAGE_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  IF jsonb_typeof(p_config)<>'object' THEN RAISE EXCEPTION 'INVALID_CONFIG'; END IF;
  SELECT * INTO v_old FROM private.hotel_tbltkbtt_credentials WHERE hotel_id=p_hotel_id;
  INSERT INTO private.hotel_tbltkbtt_credentials(hotel_id,tenant_id,enabled,endpoint_url,account,token,establishment_code,mode,updated_by)
  VALUES(p_hotel_id,v_tenant,coalesce((p_config->>'enabled')::boolean,coalesce(v_old.enabled,false)),
    coalesce(p_config->>'endpoint_url',v_old.endpoint_url),coalesce(p_config->>'account',v_old.account),
    coalesce(p_config->>'token',v_old.token),coalesce(p_config->>'establishment_code',v_old.establishment_code),
    coalesce(p_config->>'mode',v_old.mode,'dry_run'),v_actor)
  ON CONFLICT(hotel_id) DO UPDATE SET tenant_id=excluded.tenant_id,enabled=excluded.enabled,
    endpoint_url=excluded.endpoint_url,account=excluded.account,token=excluded.token,
    establishment_code=excluded.establishment_code,mode=excluded.mode,updated_by=excluded.updated_by,updated_at=now();
  UPDATE public.hotels h SET tbltkbtt_config=jsonb_build_object('enabled',c.enabled,'mode',c.mode,'establishment_code',c.establishment_code)
  FROM private.hotel_tbltkbtt_credentials c WHERE h.id=p_hotel_id AND c.hotel_id=h.id;
  RETURN private.hotel_tbltkbtt_safe(p_hotel_id);
END; $$;

UPDATE public.hotels h SET tbltkbtt_config=jsonb_build_object('enabled',c.enabled,'mode',c.mode,'establishment_code',c.establishment_code)
FROM private.hotel_tbltkbtt_credentials c WHERE c.hotel_id=h.id;

CREATE OR REPLACE FUNCTION private.sanitize_tbltkbtt_public_config()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.tbltkbtt_config=jsonb_build_object('enabled',coalesce((NEW.tbltkbtt_config->>'enabled')::boolean,false),
  'mode',coalesce(NEW.tbltkbtt_config->>'mode','dry_run'),'establishment_code',NEW.tbltkbtt_config->>'establishment_code'); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS sanitize_tbltkbtt_public_config ON public.hotels;
CREATE TRIGGER sanitize_tbltkbtt_public_config BEFORE INSERT OR UPDATE OF tbltkbtt_config ON public.hotels
FOR EACH ROW EXECUTE FUNCTION private.sanitize_tbltkbtt_public_config();

REVOKE ALL ON FUNCTION public.get_tbltkbtt_safe_config(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_tbltkbtt_config(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tbltkbtt_safe_config(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_tbltkbtt_config(uuid,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_tbltkbtt_worker_config(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_tbltkbtt_worker_config(uuid[]) TO service_role;
