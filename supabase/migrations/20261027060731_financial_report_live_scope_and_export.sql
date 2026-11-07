-- Close the legacy tenant-parameter report bypass. Financial reads and exports
-- use the same live authority/scope; report output never grants ledger access.
CREATE FUNCTION private.lock_report_exporter()
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;
BEGIN
  v_actor:=private.lock_booking_finance_reader(false);
  PERFORM 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code IN(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id=v_actor.id)
      AND (r.tenant_id=v_actor.tenant_id OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      AND p.module='reports' AND p.action='export'
    ORDER BY r.id,p.id FOR SHARE OF r,rp,p;
  IF NOT public.has_user_permission(v_actor.id,'reports','export') THEN
    RAISE EXCEPTION 'REPORT_EXPORT_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_report_exporter() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.report_assigned_hotels(p_actor public.users,p_hotel uuid)
RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_hotels uuid[];
BEGIN
  PERFORM 1 FROM public.hotels h WHERE h.tenant_id=p_actor.tenant_id AND h.status='active'
    AND (p_hotel IS NULL OR h.id=p_hotel) AND (p_actor.user_level_code='tenant_owner'
      OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=p_actor.id AND uh.hotel_id=h.id))
    ORDER BY h.id FOR SHARE;
  SELECT COALESCE(array_agg(h.id ORDER BY h.id),'{}'::uuid[]) INTO v_hotels FROM public.hotels h
    WHERE h.tenant_id=p_actor.tenant_id AND h.status='active' AND (p_hotel IS NULL OR h.id=p_hotel)
      AND (p_actor.user_level_code='tenant_owner' OR EXISTS(
        SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=p_actor.id AND uh.hotel_id=h.id));
  IF p_hotel IS NOT NULL AND NOT(p_hotel=ANY(v_hotels)) THEN
    RAISE EXCEPTION 'FINANCE_HOTEL_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_hotels;
END;
$fn$;
REVOKE ALL ON FUNCTION private.report_assigned_hotels(public.users,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE INDEX roomqc_finance_purchase_scope ON public.inventory_transactions(tenant_id,hotel_id,transaction_date)
  WHERE transaction_type='in' AND transaction_category='purchase';
CREATE INDEX roomqc_finance_laundry_scope ON public.laundry_batches(tenant_id,hotel_id,delivery_date);
CREATE INDEX roomqc_finance_maintenance_scope ON public.maintenance_requests(tenant_id,hotel_id,completed_at)
  WHERE status='completed';

CREATE FUNCTION private.financial_cost_summary(p_tenant uuid,p_hotels uuid[],p_start date,p_end date,p_timezone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  WITH costs AS (SELECT
    COALESCE((SELECT sum(total_value) FROM public.inventory_transactions WHERE tenant_id=p_tenant
      AND hotel_id=ANY(p_hotels) AND transaction_type='in' AND transaction_category='purchase'
      AND transaction_date>=p_start::timestamp AT TIME ZONE p_timezone
      AND transaction_date<p_end::timestamp AT TIME ZONE p_timezone),0) AS purchase,
    COALESCE((SELECT sum(COALESCE(actual_cost,estimated_cost,0)) FROM public.laundry_batches WHERE tenant_id=p_tenant
      AND hotel_id=ANY(p_hotels) AND status IN('delivered','washing','ready','received','stocked','completed')
      AND delivery_date>=p_start::timestamp AT TIME ZONE p_timezone
      AND delivery_date<p_end::timestamp AT TIME ZONE p_timezone),0) AS laundry,
    COALESCE((SELECT sum(actual_cost) FROM public.maintenance_requests WHERE tenant_id=p_tenant
      AND hotel_id=ANY(p_hotels) AND status='completed'
      AND completed_at>=p_start::timestamp AT TIME ZONE p_timezone
      AND completed_at<p_end::timestamp AT TIME ZONE p_timezone),0) AS maintenance
  ) SELECT jsonb_build_object('purchase_cost',purchase,'laundry_cost',laundry,
      'maintenance_cost',maintenance,'total_cost',purchase+laundry+maintenance) FROM costs;
$fn$;
REVOKE ALL ON FUNCTION private.financial_cost_summary(uuid,uuid[],date,date,text) FROM PUBLIC,anon,authenticated,service_role;

-- Monthly fixed costs are budget allocations, not cash. Partial-month reports
-- explicitly prorate calendar days and label the result as an estimate.
CREATE FUNCTION private.financial_fixed_allocation(p_tenant uuid,p_hotels uuid[],p_start date,p_end date)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT COALESCE(sum(e.amount * greatest(0,least(p_end,(m.first_day+interval '1 month')::date)
    - greatest(p_start,m.first_day))::numeric /
    ((m.first_day+interval '1 month')::date-m.first_day)),0)
  FROM public.hotel_fixed_expenses e CROSS JOIN LATERAL(
    SELECT date_trunc('month',e.month::timestamp)::date AS first_day) m
  WHERE e.tenant_id=p_tenant AND e.hotel_id=ANY(p_hotels)
    AND e.month>=date_trunc('month',p_start::timestamp)::date AND e.month<p_end;
$fn$;
REVOKE ALL ON FUNCTION private.financial_fixed_allocation(uuid,uuid[],date,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.read_financial_report(p_tenant uuid,p_hotel uuid,p_start date,p_end date,p_timezone text,p_export boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_hotels uuid[];v_revenue jsonb;v_room jsonb;v_no_show jsonb;
  v_cost jsonb;v_fixed numeric;v_net numeric;v_profit numeric;v_monthly jsonb;v_result jsonb;
BEGIN
  IF p_export THEN v_actor:=private.lock_report_exporter();
    ELSE v_actor:=private.lock_booking_finance_reader(false); END IF;
  IF p_tenant IS NOT NULL AND p_tenant IS DISTINCT FROM v_actor.tenant_id THEN
    RAISE EXCEPTION 'FINANCE_TENANT_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>3660
    OR p_start<date '1900-01-01' OR p_end>date '2100-12-31'
    OR p_timezone IS NULL OR length(p_timezone)>100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'INVALID_FINANCE_PERIOD' USING ERRCODE='22023'; END IF;
  v_hotels:=private.report_assigned_hotels(v_actor,p_hotel);
  v_revenue:=private.read_revenue_report(p_hotel,'custom',p_start,p_end,p_end,p_timezone);
  v_room:=v_revenue->'currentPeriod';v_no_show:=v_revenue->'noShow'->'currentPeriod';
  v_net:=(v_room->>'netRevenue')::numeric+(v_no_show->>'retainedAmount')::numeric;
  v_cost:=private.financial_cost_summary(v_actor.tenant_id,v_hotels,p_start,p_end+1,p_timezone);
  v_fixed:=private.financial_fixed_allocation(v_actor.tenant_id,v_hotels,p_start,p_end+1);
  v_profit:=v_net-(v_cost->>'total_cost')::numeric;
  WITH months AS(
    SELECT m::date AS month,greatest(m::date,p_start) AS first_day,
      least((m+interval '1 month')::date,p_end+1) AS last_day
      FROM generate_series(date_trunc('month',p_start::timestamp),date_trunc('month',p_end::timestamp),interval '1 month') m
  ), summaries AS(
    SELECT *,private.financial_cost_summary(v_actor.tenant_id,v_hotels,first_day,last_day,p_timezone) AS cost,
      private.revenue_booking_summary(v_actor.tenant_id,v_hotels,first_day,last_day) AS room,
      private.revenue_no_show_summary(v_actor.tenant_id,v_hotels,
        first_day::timestamp AT TIME ZONE p_timezone,last_day::timestamp AT TIME ZONE p_timezone) AS no_show,
      private.financial_fixed_allocation(v_actor.tenant_id,v_hotels,first_day,last_day) AS fixed FROM months
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('month',to_char(month,'MM/YYYY'),
    'period_start',first_day,'period_end',last_day-1,'purchase',cost->'purchase_cost',
    'laundry',cost->'laundry_cost','maintenance',cost->'maintenance_cost',
    'room_revenue',room->'netRevenue','no_show_fees',no_show->'retainedAmount',
    'revenue',(room->>'netRevenue')::numeric+(no_show->>'retainedAmount')::numeric,
    'refund_due',no_show->'refundDueAmount','fixed_cost_allocation',fixed,
    'profit',(room->>'netRevenue')::numeric+(no_show->>'retainedAmount')::numeric-(cost->>'total_cost')::numeric
    ) ORDER BY month),'[]'::jsonb) INTO v_monthly FROM summaries;
  v_result:=jsonb_build_object('version',2,'period_start',p_start,'period_end',p_end,'recognition_timezone',p_timezone,
    'summary',v_cost,'cost_summary',v_cost,
    'revenue_summary',jsonb_build_object('gross_revenue',v_room->'totalRevenue','paid_revenue',v_room->'paidRevenue',
      'pending_revenue',v_room->'pendingRevenue','ota_commission',v_room->'otaCommission',
      'vat_amount',v_room->'vatAmount','net_revenue',v_room->'netRevenue',
      'no_show_fees',v_no_show->'retainedAmount','recognized_revenue',v_net),
    'no_show',v_revenue->'noShow',
    'fixed_cost_summary',jsonb_build_object('allocated_amount',v_fixed,'method','calendar_day_proration','is_estimate',true),
    'profit_summary',jsonb_build_object('net_profit',v_profit,'after_allocated_fixed_cost',v_profit-v_fixed,
      'profit_margin',CASE WHEN v_net>0 THEN round(v_profit/v_net*100,1) ELSE 0 END),
    'monthly_trend',v_monthly,'cost_by_category',jsonb_build_array(
      jsonb_build_object('category','purchase','cost',v_cost->'purchase_cost'),
      jsonb_build_object('category','laundry','cost',v_cost->'laundry_cost'),
      jsonb_build_object('category','maintenance','cost',v_cost->'maintenance_cost')));
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.read_financial_report(uuid,uuid,date,date,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_financial_report(uuid,uuid,date,date,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_financial_report(p_tenant_id uuid,p_hotel_id uuid,p_start_date date,p_end_date date)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.read_financial_report(p_tenant_id,p_hotel_id,p_start_date,p_end_date,'Asia/Ho_Chi_Minh',false);
$fn$;
REVOKE ALL ON FUNCTION public.get_financial_report(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_report(uuid,uuid,date,date) TO authenticated;

CREATE FUNCTION public.get_financial_report_scoped(p_start_date date,p_end_date date,p_hotel_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'Asia/Ho_Chi_Minh',p_for_export boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.read_financial_report(NULL,p_hotel_id,p_start_date,p_end_date,p_timezone,COALESCE(p_for_export,false));
$fn$;
REVOKE ALL ON FUNCTION public.get_financial_report_scoped(date,date,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_financial_report_scoped(date,date,uuid,text,boolean) TO authenticated;

CREATE FUNCTION private.export_revenue_report(p_hotel uuid,p_start date,p_end date,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_result jsonb;
BEGIN
  v_actor:=private.lock_report_exporter();
  v_result:=private.read_revenue_report(p_hotel,'custom',p_start,p_end,p_end,p_timezone);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.export_revenue_report(uuid,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.export_revenue_report(uuid,date,date,text) TO authenticated;
CREATE FUNCTION public.export_revenue_report(p_start_date date,p_end_date date,p_hotel_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.export_revenue_report(p_hotel_id,p_start_date,p_end_date,p_timezone);
$fn$;
REVOKE ALL ON FUNCTION public.export_revenue_report(date,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.export_revenue_report(date,date,uuid,text) TO authenticated;
