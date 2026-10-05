
-- =====================================================
-- Pricing daily-grid v1: rate_plans + daily_prices + room_type_availability
-- =====================================================

-- 1. rate_plans
CREATE TABLE public.rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12,2),
  sale_price numeric(12,2),
  sale_start_date date,
  sale_end_date date,
  inclusions text[] NOT NULL DEFAULT '{}',
  policies text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_plans TO authenticated;
GRANT ALL ON public.rate_plans TO service_role;

ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rp_tenant_select" ON public.rate_plans FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE POLICY "rp_tenant_modify" ON public.rate_plans FOR ALL TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE INDEX idx_rp_tenant_type ON public.rate_plans(tenant_id, room_type_id);
CREATE INDEX idx_rp_hotel ON public.rate_plans(hotel_id);

CREATE TRIGGER trg_rp_updated BEFORE UPDATE ON public.rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2. rate_plan_daily_prices
CREATE TABLE public.rate_plan_daily_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL REFERENCES public.rate_plans(id) ON DELETE CASCADE,
  date date NOT NULL,
  price numeric(12,2),
  sale_price numeric(12,2),
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rate_plan_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_plan_daily_prices TO authenticated;
GRANT ALL ON public.rate_plan_daily_prices TO service_role;

ALTER TABLE public.rate_plan_daily_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rpdp_tenant_select" ON public.rate_plan_daily_prices FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE POLICY "rpdp_tenant_modify" ON public.rate_plan_daily_prices FOR ALL TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE INDEX idx_rpdp_plan_date ON public.rate_plan_daily_prices(rate_plan_id, date);
CREATE INDEX idx_rpdp_tenant_date ON public.rate_plan_daily_prices(tenant_id, date);

CREATE TRIGGER trg_rpdp_updated BEFORE UPDATE ON public.rate_plan_daily_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3. room_type_availability
CREATE TABLE public.room_type_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  date date NOT NULL,
  available_qty int NOT NULL DEFAULT 0,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_type_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_availability TO authenticated;
GRANT ALL ON public.room_type_availability TO service_role;

ALTER TABLE public.room_type_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rta_tenant_select" ON public.room_type_availability FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE POLICY "rta_tenant_modify" ON public.room_type_availability FOR ALL TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE INDEX idx_rta_type_date ON public.room_type_availability(room_type_id, date);
CREATE INDEX idx_rta_tenant_date ON public.room_type_availability(tenant_id, date);

CREATE TRIGGER trg_rta_updated BEFORE UPDATE ON public.room_type_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4. RPC: bulk upsert daily prices
CREATE OR REPLACE FUNCTION public.bulk_upsert_daily_prices(
  _rate_plan_id uuid,
  _dates date[],
  _price numeric DEFAULT NULL,
  _sale_price numeric DEFAULT NULL,
  _is_closed boolean DEFAULT NULL,
  _reset boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _affected int := 0;
BEGIN
  SELECT tenant_id INTO _tenant_id FROM public.rate_plans WHERE id = _rate_plan_id;
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'Rate plan không tồn tại'; END IF;
  IF _tenant_id NOT IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền truy cập';
  END IF;

  IF _reset THEN
    DELETE FROM public.rate_plan_daily_prices
     WHERE rate_plan_id = _rate_plan_id AND date = ANY(_dates);
    GET DIAGNOSTICS _affected = ROW_COUNT;
    RETURN _affected;
  END IF;

  INSERT INTO public.rate_plan_daily_prices (tenant_id, rate_plan_id, date, price, sale_price, is_closed)
  SELECT _tenant_id, _rate_plan_id, d,
         COALESCE(_price, NULL),
         COALESCE(_sale_price, NULL),
         COALESCE(_is_closed, false)
  FROM unnest(_dates) AS d
  ON CONFLICT (rate_plan_id, date) DO UPDATE
    SET price      = COALESCE(_price, public.rate_plan_daily_prices.price),
        sale_price = CASE WHEN _sale_price IS NOT NULL THEN _sale_price ELSE public.rate_plan_daily_prices.sale_price END,
        is_closed  = COALESCE(_is_closed, public.rate_plan_daily_prices.is_closed),
        updated_at = now();

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;


-- 5. RPC: bulk upsert room type availability
CREATE OR REPLACE FUNCTION public.bulk_upsert_rt_availability(
  _room_type_id uuid,
  _dates date[],
  _qty int DEFAULT NULL,
  _is_closed boolean DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _hotel_id uuid;
  _affected int := 0;
BEGIN
  SELECT tenant_id, hotel_id INTO _tenant_id, _hotel_id FROM public.room_types WHERE id = _room_type_id;
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'Hạng phòng không tồn tại'; END IF;
  IF _tenant_id NOT IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền truy cập';
  END IF;

  INSERT INTO public.room_type_availability (tenant_id, hotel_id, room_type_id, date, available_qty, is_closed)
  SELECT _tenant_id, _hotel_id, _room_type_id, d,
         COALESCE(_qty, 0),
         COALESCE(_is_closed, false)
  FROM unnest(_dates) AS d
  ON CONFLICT (room_type_id, date) DO UPDATE
    SET available_qty = COALESCE(_qty, public.room_type_availability.available_qty),
        is_closed     = COALESCE(_is_closed, public.room_type_availability.is_closed),
        updated_at    = now();

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;
