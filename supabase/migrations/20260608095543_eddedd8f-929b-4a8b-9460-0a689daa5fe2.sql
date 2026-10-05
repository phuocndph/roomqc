CREATE OR REPLACE FUNCTION public.sync_pricing_rules_to_hotel_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.hotel_settings (
    tenant_id, hotel_id,
    vat_rate, service_fee_rate,
    late_checkout_12_15_pct, late_checkout_15_18_pct, late_checkout_after18_pct,
    early_checkin_before5_pct, early_checkin_5_9_pct, early_checkin_9_14_pct
  ) VALUES (
    NEW.tenant_id, NEW.hotel_id,
    NEW.default_vat_rate, NEW.default_service_fee_rate,
    NEW.late_checkout_12_15, NEW.late_checkout_15_18, NEW.late_checkout_after_18,
    NEW.early_checkin_before_5, NEW.early_checkin_5_9, NEW.early_checkin_9_14
  )
  ON CONFLICT (hotel_id) DO UPDATE SET
    vat_rate                  = EXCLUDED.vat_rate,
    service_fee_rate          = EXCLUDED.service_fee_rate,
    late_checkout_12_15_pct   = EXCLUDED.late_checkout_12_15_pct,
    late_checkout_15_18_pct   = EXCLUDED.late_checkout_15_18_pct,
    late_checkout_after18_pct = EXCLUDED.late_checkout_after18_pct,
    early_checkin_before5_pct = EXCLUDED.early_checkin_before5_pct,
    early_checkin_5_9_pct     = EXCLUDED.early_checkin_5_9_pct,
    early_checkin_9_14_pct    = EXCLUDED.early_checkin_9_14_pct,
    updated_at                = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_pricing_to_hotel_settings ON public.room_pricing_rules;
CREATE TRIGGER trg_sync_pricing_to_hotel_settings
  AFTER INSERT OR UPDATE ON public.room_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.sync_pricing_rules_to_hotel_settings();

-- Backfill existing rows so current settings sync immediately
INSERT INTO public.hotel_settings (
  tenant_id, hotel_id,
  vat_rate, service_fee_rate,
  late_checkout_12_15_pct, late_checkout_15_18_pct, late_checkout_after18_pct,
  early_checkin_before5_pct, early_checkin_5_9_pct, early_checkin_9_14_pct
)
SELECT
  tenant_id, hotel_id,
  default_vat_rate, default_service_fee_rate,
  late_checkout_12_15, late_checkout_15_18, late_checkout_after_18,
  early_checkin_before_5, early_checkin_5_9, early_checkin_9_14
FROM public.room_pricing_rules
ON CONFLICT (hotel_id) DO UPDATE SET
  vat_rate                  = EXCLUDED.vat_rate,
  service_fee_rate          = EXCLUDED.service_fee_rate,
  late_checkout_12_15_pct   = EXCLUDED.late_checkout_12_15_pct,
  late_checkout_15_18_pct   = EXCLUDED.late_checkout_15_18_pct,
  late_checkout_after18_pct = EXCLUDED.late_checkout_after18_pct,
  early_checkin_before5_pct = EXCLUDED.early_checkin_before5_pct,
  early_checkin_5_9_pct     = EXCLUDED.early_checkin_5_9_pct,
  early_checkin_9_14_pct    = EXCLUDED.early_checkin_9_14_pct,
  updated_at                = now();