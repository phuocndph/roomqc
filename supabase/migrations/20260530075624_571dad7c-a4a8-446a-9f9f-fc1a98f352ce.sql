
-- ============ B1. Guests: bổ sung trường khai báo BCA ============
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS id_issue_date date,
  ADD COLUMN IF NOT EXISTS id_issue_place text,
  ADD COLUMN IF NOT EXISTS id_expiry_date date,
  ADD COLUMN IF NOT EXISTS ethnicity text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS permanent_address text,
  ADD COLUMN IF NOT EXISTS visa_number text,
  ADD COLUMN IF NOT EXISTS visa_expiry date,
  ADD COLUMN IF NOT EXISTS entry_date date,
  ADD COLUMN IF NOT EXISTS entry_port text;

-- ============ B2. guest_stay_registrations ============
CREATE TABLE IF NOT EXISTS public.guest_stay_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.room_bookings(id) ON DELETE SET NULL,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  check_in_at timestamptz NOT NULL,
  check_out_at timestamptz,
  purpose text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','submitting','submitted','acked','failed','manual')),
  payload jsonb,
  response jsonb,
  external_ref text,
  attempt_count int NOT NULL DEFAULT 0,
  last_error text,
  submitted_at timestamptz,
  acked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.guest_stay_registrations TO authenticated;
GRANT ALL ON public.guest_stay_registrations TO service_role;

ALTER TABLE public.guest_stay_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stay_reg_tenant_select" ON public.guest_stay_registrations
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "stay_reg_tenant_insert" ON public.guest_stay_registrations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "stay_reg_tenant_update" ON public.guest_stay_registrations
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stay_reg_tenant_status ON public.guest_stay_registrations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_stay_reg_booking ON public.guest_stay_registrations(booking_id);
CREATE INDEX IF NOT EXISTS idx_stay_reg_pending ON public.guest_stay_registrations(status, created_at)
  WHERE status IN ('pending','failed');

CREATE TRIGGER trg_stay_reg_updated
  BEFORE UPDATE ON public.guest_stay_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ B3. hotels.tbltkbtt_config ============
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS tbltkbtt_config jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Suggested keys: { enabled: bool, dry_run: bool, account: text, prov_code: text,
--   facility_code: text, endpoint_url: text, vault_secret_key: text, auto_submit: bool }

-- ============ B4. room_type_rates ============
CREATE TABLE IF NOT EXISTS public.room_type_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  daily_rate numeric(12,2) NOT NULL DEFAULT 0,
  overnight_rate numeric(12,2),
  hourly_rate numeric(12,2),
  hourly_first_block_hours int DEFAULT 2,
  hourly_first_block_price numeric(12,2),
  monthly_rate numeric(12,2),
  overnight_start_time time DEFAULT '22:00',
  overnight_end_time time DEFAULT '09:00',
  weekday_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_type_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_rates TO authenticated;
GRANT ALL ON public.room_type_rates TO service_role;

ALTER TABLE public.room_type_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rtr_tenant_select" ON public.room_type_rates
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "rtr_tenant_modify" ON public.room_type_rates
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_rtr_tenant ON public.room_type_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rtr_hotel ON public.room_type_rates(hotel_id);

CREATE TRIGGER trg_rtr_updated
  BEFORE UPDATE ON public.room_type_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ B5. seasonal_rate_overrides ============
CREATE TABLE IF NOT EXISTS public.seasonal_rate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  room_type_ids uuid[] NOT NULL DEFAULT '{}',
  apply_to text[] NOT NULL DEFAULT ARRAY['daily','overnight'],
  mode text NOT NULL CHECK (mode IN ('add_on','overwrite')),
  adjust_type text NOT NULL CHECK (adjust_type IN ('percent','vnd')),
  adjust_value numeric(12,2) NOT NULL,
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasonal_rate_overrides TO authenticated;
GRANT ALL ON public.seasonal_rate_overrides TO service_role;

ALTER TABLE public.seasonal_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sro_tenant_select" ON public.seasonal_rate_overrides
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "sro_tenant_modify" ON public.seasonal_rate_overrides
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sro_tenant_active ON public.seasonal_rate_overrides(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_sro_dates ON public.seasonal_rate_overrides(from_date, to_date);

CREATE TRIGGER trg_sro_updated
  BEFORE UPDATE ON public.seasonal_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ B6. room_bookings: cột overnight ============
ALTER TABLE public.room_bookings
  ADD COLUMN IF NOT EXISTS overnight_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS overnight_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS overnight_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS price_breakdown jsonb;

-- Cấp UPDATE cho các cột mới (vì cột status đã bị revoke tổng quát theo State Machine)
GRANT UPDATE (overnight_rate, overnight_start_time, overnight_end_time, price_breakdown)
  ON public.room_bookings TO authenticated;

-- ============ B7. Backfill room_type_rates từ base_price ============
INSERT INTO public.room_type_rates (tenant_id, hotel_id, room_type_id, daily_rate)
SELECT rt.tenant_id, rt.hotel_id, rt.id, COALESCE(rt.base_price, 0)
FROM public.room_types rt
WHERE NOT EXISTS (
  SELECT 1 FROM public.room_type_rates rtr WHERE rtr.room_type_id = rt.id
);
