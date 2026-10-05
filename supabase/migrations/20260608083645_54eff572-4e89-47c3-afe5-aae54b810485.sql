CREATE TABLE IF NOT EXISTS public.hotel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_settings TO authenticated;
GRANT ALL ON public.hotel_settings TO service_role;

ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hotel_settings' AND policyname='hotel_settings_tenant_read') THEN
    CREATE POLICY hotel_settings_tenant_read ON public.hotel_settings
      FOR SELECT TO authenticated
      USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hotel_settings' AND policyname='hotel_settings_tenant_write') THEN
    CREATE POLICY hotel_settings_tenant_write ON public.hotel_settings
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_hotel_settings_updated_at ON public.hotel_settings;
CREATE TRIGGER trg_hotel_settings_updated_at
  BEFORE UPDATE ON public.hotel_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 8 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  ADD COLUMN IF NOT EXISTS service_fee_rate numeric DEFAULT 5 CHECK (service_fee_rate >= 0 AND service_fee_rate <= 100),
  ADD COLUMN IF NOT EXISTS late_checkout_12_15_pct numeric DEFAULT 30,
  ADD COLUMN IF NOT EXISTS late_checkout_15_18_pct numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS late_checkout_after18_pct numeric DEFAULT 100,
  ADD COLUMN IF NOT EXISTS early_checkin_before5_pct numeric DEFAULT 100,
  ADD COLUMN IF NOT EXISTS early_checkin_5_9_pct numeric DEFAULT 50,
  ADD COLUMN IF NOT EXISTS early_checkin_9_14_pct numeric DEFAULT 30,
  ADD COLUMN IF NOT EXISTS monthly_discounts jsonb DEFAULT '{"1":0,"2":0,"3":5,"6":10,"12":15}'::jsonb;