-- Initial room setup: server-persisted draft, optimistic version and one atomic commit.
CREATE TABLE IF NOT EXISTS private.hotel_room_setup (
  hotel_id uuid PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  rooms jsonb NOT NULL CHECK (jsonb_typeof(rooms) = 'array' AND jsonb_array_length(rooms) BETWEEN 1 AND 200),
  completed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hotel_room_setup_tenant_idx ON private.hotel_room_setup(tenant_id);
ALTER TABLE private.hotel_room_setup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.hotel_room_setup FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.room_setup_owner(p_hotel_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid;
BEGIN
  SELECT h.tenant_id INTO v_tenant FROM public.hotels h
  JOIN public.users u ON u.tenant_id=h.tenant_id AND u.id=auth.uid() AND u.status='active'
  JOIN auth.users au ON au.id=u.id AND au.email_confirmed_at IS NOT NULL
  WHERE h.id=p_hotel_id AND h.status='active'
    AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=u.id AND ur.role='owner');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Chỉ chủ sở hữu được thiết lập khách sạn này.' USING ERRCODE='42501'; END IF;
  RETURN v_tenant;
END;
$fn$;
REVOKE ALL ON FUNCTION private.room_setup_owner(uuid) FROM PUBLIC, anon, authenticated;

-- Every room INSERT (REST, normal forms, import and wizard) uses the same lock.
-- Count real rows after acquiring the tenant lock, never a stale usage counter.
CREATE OR REPLACE FUNCTION private.enforce_room_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid; v_t public.tenants%ROWTYPE; v_max integer; v_limit integer; v_count integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id AND NEW.hotel_id IS NOT DISTINCT FROM OLD.hotel_id THEN RETURN NEW; END IF;
  SELECT tenant_id INTO v_tenant FROM public.hotels WHERE id=NEW.hotel_id;
  IF v_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'Phòng và khách sạn phải thuộc cùng doanh nghiệp.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_t FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  IF v_t.is_read_only IS DISTINCT FROM false OR COALESCE(v_t.subscription_status,'') NOT IN ('active','trial')
    OR (v_t.subscription_status='trial' AND (v_t.trial_ends_at IS NULL OR v_t.trial_ends_at <= now()))
    OR (v_t.subscription_status='active' AND (v_t.subscription_end_date IS NULL OR v_t.subscription_end_date < current_date)) THEN
    RAISE EXCEPTION 'Gói dịch vụ chưa hoạt động hoặc đã hết hạn. Vui lòng kiểm tra gói sử dụng.' USING ERRCODE='42501';
  END IF;
  SELECT max_rooms INTO v_max FROM public.subscription_plans WHERE id=v_t.subscription_plan_id AND is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chưa xác định được giới hạn gói sử dụng.' USING ERRCODE='42501'; END IF;
  -- Trial registration historically leaves registered_rooms=0; use its server plan.
  v_limit := CASE WHEN v_t.subscription_status='trial' AND COALESCE(v_t.registered_rooms,0)=0 THEN v_max ELSE COALESCE(v_t.registered_rooms,0) END;
  IF v_max IS NOT NULL THEN v_limit := LEAST(COALESCE(v_limit,v_max),v_max); END IF;
  SELECT count(*) INTO v_count FROM public.rooms WHERE tenant_id=v_tenant AND (TG_OP='INSERT' OR id<>NEW.id);
  IF v_limit IS NOT NULL AND v_count >= v_limit THEN
    RAISE EXCEPTION 'Vượt giới hạn % phòng của doanh nghiệp. Hiện có % phòng.',v_limit,v_count USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.enforce_room_capacity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_check_room_quota ON public.rooms;
CREATE TRIGGER trg_check_room_quota BEFORE INSERT OR UPDATE OF tenant_id,hotel_id ON public.rooms
FOR EACH ROW EXECUTE FUNCTION private.enforce_room_capacity();

CREATE OR REPLACE FUNCTION private.refresh_room_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid := CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
BEGIN
  PERFORM 1 FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  UPDATE public.tenant_usage SET current_rooms_count=(SELECT count(*) FROM public.rooms WHERE tenant_id=v_tenant),updated_at=now()
    WHERE tenant_id=v_tenant;
  IF TG_OP='UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    UPDATE public.tenant_usage SET current_rooms_count=(SELECT count(*) FROM public.rooms WHERE tenant_id=OLD.tenant_id),updated_at=now()
      WHERE tenant_id=OLD.tenant_id;
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION private.refresh_room_count() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_refresh_room_count ON public.rooms;
CREATE TRIGGER trg_refresh_room_count AFTER INSERT OR DELETE OR UPDATE OF tenant_id ON public.rooms
FOR EACH ROW EXECUTE FUNCTION private.refresh_room_count();

CREATE OR REPLACE FUNCTION public.get_hotel_room_setup(p_hotel_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_d private.hotel_room_setup%ROWTYPE; v_count integer; v_total integer;
BEGIN
  PERFORM private.room_setup_owner(p_hotel_id);
  SELECT * INTO v_d FROM private.hotel_room_setup WHERE hotel_id=p_hotel_id;
  SELECT count(*) INTO v_count FROM public.rooms WHERE hotel_id=p_hotel_id;
  SELECT total_rooms INTO v_total FROM public.hotels WHERE id=p_hotel_id;
  RETURN jsonb_build_object('hotel_id',p_hotel_id,'version',COALESCE(v_d.version,0),
    'request_id',v_d.request_id,'rooms',COALESCE(v_d.rooms,'[]'::jsonb),'completed_at',v_d.completed_at,
    'actual_rooms',v_count,'expected_rooms',v_total,'updated_at',v_d.updated_at);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_hotel_room_setup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hotel_room_setup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_hotel_room_setup(p_hotel_id uuid,p_expected_version integer,p_rooms jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid; v_d private.hotel_room_setup%ROWTYPE;
BEGIN
  v_tenant := private.room_setup_owner(p_hotel_id);
  PERFORM 1 FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  PERFORM 1 FROM public.hotels WHERE id=p_hotel_id FOR UPDATE;
  IF jsonb_typeof(p_rooms) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Danh sách phòng không hợp lệ.' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_rooms) NOT BETWEEN 1 AND 200 OR pg_column_size(p_rooms)>150000 THEN
    RAISE EXCEPTION 'Mỗi lần thiết lập từ 1 đến 200 phòng.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rooms) r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object'
    OR jsonb_typeof(r->'room_number') IS DISTINCT FROM 'string' OR length(btrim(r->>'room_number')) NOT BETWEEN 1 AND 20
    OR r->>'room_number'<>btrim(r->>'room_number') OR r->>'room_number' ~ '[[:cntrl:]]'
    OR COALESCE(r->>'floor','') !~ '^[1-9][0-9]{0,2}$'
    OR COALESCE(r->>'room_type','') NOT IN ('standard','deluxe','suite','vip')
    OR COALESCE(r->>'max_guests','') !~ '^([1-9]|1[0-9]|20)$'
    OR COALESCE(r->>'base_price','') !~ '^[0-9]{1,9}$'
    OR COALESCE(r->>'hourly_price','') !~ '^[0-9]{1,9}$'
    OR COALESCE(r->>'monthly_price','') !~ '^[0-9]{1,9}$') THEN
    RAISE EXCEPTION 'Kiểm tra số phòng, tầng, loại phòng, sức chứa và giá nguyên từ 0 đến 999.999.999.' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_rooms)) <> (SELECT count(DISTINCT lower(r->>'room_number')) FROM jsonb_array_elements(p_rooms) r) THEN
    RAISE EXCEPTION 'Danh sách có số phòng trùng nhau.' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rooms) r GROUP BY r->>'room_type'
    HAVING count(DISTINCT (r->>'base_price')::numeric)>1 OR count(DISTINCT (r->>'hourly_price')::numeric)>1 OR count(DISTINCT (r->>'monthly_price')::numeric)>1) THEN
    RAISE EXCEPTION 'Các phòng cùng loại cần dùng chung một bảng giá.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_d FROM private.hotel_room_setup WHERE hotel_id=p_hotel_id FOR UPDATE;
  IF v_d.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Đã hoàn tất thiết lập. Hãy quản lý phòng ở danh sách phòng.' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT 1 FROM public.rooms WHERE hotel_id=p_hotel_id) THEN
    RAISE EXCEPTION 'Khách sạn đã có phòng. Hãy thêm hoặc chỉnh sửa tại danh sách phòng.' USING ERRCODE='55000';
  END IF;
  -- A response-lost retry of the exact draft is safe, even with the old version.
  IF v_d.rooms=p_rooms THEN RETURN public.get_hotel_room_setup(p_hotel_id); END IF;
  IF p_expected_version IS DISTINCT FROM COALESCE(v_d.version,0) THEN
    RAISE EXCEPTION 'Bản nháp đã được sửa ở nơi khác. Tải lại trước khi lưu.' USING ERRCODE='40001';
  END IF;
  INSERT INTO private.hotel_room_setup(hotel_id,tenant_id,version,rooms)
    VALUES(p_hotel_id,v_tenant,1,p_rooms)
    ON CONFLICT(hotel_id) DO UPDATE SET version=private.hotel_room_setup.version+1,rooms=excluded.rooms,
      request_id=gen_random_uuid(),updated_at=now();
  RETURN public.get_hotel_room_setup(p_hotel_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_hotel_room_setup(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_hotel_room_setup(uuid,integer,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_hotel_room_setup(p_hotel_id uuid,p_request_id uuid,p_version integer,p_confirm_prices boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_tenant uuid; v_d private.hotel_room_setup%ROWTYPE; v_r record; v_rt public.room_types%ROWTYPE;
BEGIN
  v_tenant := private.room_setup_owner(p_hotel_id);
  PERFORM 1 FROM public.tenants WHERE id=v_tenant FOR UPDATE;
  PERFORM 1 FROM public.hotels WHERE id=p_hotel_id FOR UPDATE;
  SELECT * INTO v_d FROM private.hotel_room_setup WHERE hotel_id=p_hotel_id FOR UPDATE;
  IF NOT FOUND OR p_request_id IS DISTINCT FROM v_d.request_id OR p_version IS DISTINCT FROM v_d.version THEN
    RAISE EXCEPTION 'Bản xem trước đã thay đổi. Tải lại trước khi xác nhận.' USING ERRCODE='40001';
  END IF;
  IF v_d.completed_at IS NOT NULL THEN RETURN public.get_hotel_room_setup(p_hotel_id)||jsonb_build_object('idempotent',true); END IF;
  IF p_confirm_prices IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cần xác nhận danh sách phòng và bảng giá.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.rooms WHERE hotel_id=p_hotel_id) THEN
    RAISE EXCEPTION 'Khách sạn đã có phòng. Không thể ghi đè từ thiết lập ban đầu.' USING ERRCODE='55000';
  END IF;
  -- Existing legacy type codes are unique across the tenant. Never overwrite
  -- another hotel's live rates while this schema is still shared by type code.
  FOR v_r IN SELECT DISTINCT r->>'room_type' AS kind,(r->>'base_price')::numeric AS nightly,
      (r->>'hourly_price')::numeric AS hourly,(r->>'monthly_price')::numeric AS monthly
      FROM jsonb_array_elements(v_d.rooms) r ORDER BY kind LOOP
    IF EXISTS(SELECT 1 FROM public.rooms WHERE tenant_id=v_tenant AND hotel_id<>p_hotel_id AND room_type=v_r.kind) THEN
      RAISE EXCEPTION 'Loại phòng % đang dùng tại khách sạn khác. Hãy cấu hình phòng và bảng giá qua các màn hình quản lý hiện có.',v_r.kind USING ERRCODE='55000';
    END IF;
    SELECT * INTO v_rt FROM public.room_types WHERE tenant_id=v_tenant AND code=public.room_type_pricing_code(v_r.kind) FOR UPDATE;
    IF FOUND AND (v_rt.status<>'active' OR (v_rt.hotel_id IS NOT NULL AND v_rt.hotel_id<>p_hotel_id)) THEN
      RAISE EXCEPTION 'Loại phòng % thuộc khách sạn khác hoặc đã ngừng sử dụng.',v_r.kind USING ERRCODE='55000';
    END IF;
    INSERT INTO public.room_types(tenant_id,hotel_id,name,code,base_price,status)
      VALUES(v_tenant,p_hotel_id,'Phòng '||initcap(v_r.kind),public.room_type_pricing_code(v_r.kind),v_r.nightly,'active')
      ON CONFLICT(tenant_id,code) DO UPDATE SET base_price=excluded.base_price,hotel_id=excluded.hotel_id
      RETURNING * INTO v_rt;
    INSERT INTO public.room_type_rates(tenant_id,hotel_id,room_type_id,daily_rate,hourly_rate,monthly_rate)
      VALUES(v_tenant,p_hotel_id,v_rt.id,v_r.nightly,v_r.hourly,v_r.monthly)
      ON CONFLICT(room_type_id) DO UPDATE SET daily_rate=excluded.daily_rate,hourly_rate=excluded.hourly_rate,
        monthly_rate=excluded.monthly_rate,hotel_id=excluded.hotel_id,updated_at=now();
  END LOOP;
  INSERT INTO public.rooms(tenant_id,hotel_id,room_number,floor,room_type,max_guests,base_price,hourly_price,monthly_price,status)
    SELECT v_tenant,p_hotel_id,r->>'room_number',(r->>'floor')::integer,r->>'room_type',(r->>'max_guests')::integer,
      (r->>'base_price')::numeric,(r->>'hourly_price')::numeric,(r->>'monthly_price')::numeric,'vacant_clean'
    FROM jsonb_array_elements(v_d.rooms) r;
  UPDATE private.hotel_room_setup SET completed_at=now(),confirmed_by=auth.uid(),updated_at=now() WHERE hotel_id=p_hotel_id;
  PERFORM public.update_tenant_usage(v_tenant);
  RETURN public.get_hotel_room_setup(p_hotel_id)||jsonb_build_object('idempotent',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.complete_hotel_room_setup(uuid,uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_hotel_room_setup(uuid,uuid,integer,boolean) TO authenticated;
