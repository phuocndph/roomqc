-- W1 P1: report/lookup RPCs must execute as the caller so table RLS
-- enforces tenant and hotel scope. These functions only read data; trusted
-- service jobs continue to work because service_role bypasses RLS.

ALTER FUNCTION public.get_dead_stock_report(uuid, uuid, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_latest_consumption_snapshots(uuid, uuid, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_consumption_trend(uuid, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_booking_chargeable_total(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_vendor_performance(uuid, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_laundry_batches_filtered(uuid, uuid, uuid, text, text, date, date, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_hotel_performance_stats(uuid, uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_hotels_performance_comparison(uuid, date, date) SECURITY INVOKER;
ALTER FUNCTION public.get_stock_adjustments_filtered(uuid, uuid, text, text, uuid, date, date, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_room_standards(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.get_room_items_with_standards(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_tenant_billing_summary(uuid) SECURITY INVOKER;
ALTER FUNCTION public.calculate_booking_price(uuid, text, timestamptz, timestamptz, uuid, boolean) SECURITY INVOKER;
ALTER FUNCTION public.resolve_daily_prices_bulk(uuid, date, date, text, uuid) SECURITY INVOKER;

