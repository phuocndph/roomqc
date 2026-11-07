-- Aggregate inside Postgres, before Data API row limits. All three periods and
-- the daily series share the financial report's recognition and live authority.
CREATE INDEX roomqc_operations_stay_scope ON public.room_bookings
  (tenant_id,hotel_id,check_in_date,check_out_date)
  WHERE status IN('checked_in','checked_out','sleep_out','skipper') AND payment_status IS DISTINCT FROM 'refunded';

CREATE FUNCTION private.operations_period_summary(p_tenant uuid,p_hotels uuid[],p_start date,p_end date,p_timezone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  WITH financial AS MATERIALIZED (
    SELECT private.revenue_booking_summary(p_tenant,p_hotels,p_start,p_end) AS room,
      private.revenue_no_show_summary(p_tenant,p_hotels,p_start::timestamp AT TIME ZONE p_timezone,
        p_end::timestamp AT TIME ZONE p_timezone) AS no_show,
      private.financial_cost_summary(p_tenant,p_hotels,p_start,p_end,p_timezone) AS cost
  ), checkout_nights AS (
    -- ADR's denominator belongs to the same earned checkout cohort as revenue.
    SELECT count(*) AS earned_checkouts,
      COALESCE(sum(greatest(1,check_out_date-check_in_date)) FILTER(WHERE check_in_date<=check_out_date),0) AS nights,
      count(*) FILTER(WHERE check_in_date IS NULL OR check_in_date>check_out_date) AS invalid_dates
    FROM public.room_bookings WHERE tenant_id=p_tenant AND hotel_id=ANY(p_hotels)
      AND status='checked_out' AND payment_status IS DISTINCT FROM 'refunded'
      AND check_out_date>=p_start AND check_out_date<p_end
  ), room_ranges AS (
    -- Occupancy is a different denominator: clip to the period and union stays
    -- per current registered room. Duplicated/hourly bookings cannot count one
    -- room twice in one calendar day. Day use consumes one day; checkout does not.
    SELECT b.room_id,range_agg(daterange(greatest(b.check_in_date,p_start),
      least(greatest(b.check_out_date,b.check_in_date+1),p_end),'[)')) AS spans
    FROM public.room_bookings b JOIN public.rooms r ON r.id=b.room_id
      AND r.tenant_id=b.tenant_id AND r.hotel_id=b.hotel_id
    WHERE b.tenant_id=p_tenant AND b.hotel_id=ANY(p_hotels)
      AND b.status IN('checked_in','checked_out','sleep_out','skipper') AND b.payment_status IS DISTINCT FROM 'refunded'
      AND b.check_out_date>=b.check_in_date AND b.check_in_date<p_end
      AND greatest(b.check_out_date,b.check_in_date+1)>p_start
    GROUP BY b.room_id
  ), occupied AS (
    SELECT COALESCE(sum(upper(span)-lower(span)),0) AS days
      FROM room_ranges CROSS JOIN LATERAL unnest(spans) span
  ), totals AS (
    SELECT *, (room->>'netRevenue')::numeric+(no_show->>'retainedAmount')::numeric AS recognized
    FROM financial
  ) SELECT jsonb_build_object('period_start',p_start,'period_end',p_end-1,'period_days',p_end-p_start,
    'room',room,'no_show',no_show,'cost_summary',cost,'recognized_revenue',recognized,
    'net_profit',recognized-(cost->>'total_cost')::numeric,
    'earned_checkout_count',checkout_nights.earned_checkouts,'checkout_room_nights',checkout_nights.nights,
    'invalid_checkout_dates_count',checkout_nights.invalid_dates,
    'occupied_room_days',occupied.days) FROM totals CROSS JOIN checkout_nights CROSS JOIN occupied;
$fn$;
REVOKE ALL ON FUNCTION private.operations_period_summary(uuid,uuid[],date,date,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.operations_daily_series(p_tenant uuid,p_hotels uuid[],p_start date,p_end date,p_timezone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  -- Each source is read once for the requested range, not once per day.
  WITH events AS (
    SELECT check_out_date AS day,
      CASE WHEN net_revenue IS NOT NULL AND (net_revenue<>0 OR COALESCE(total_amount,0)=0)
        THEN net_revenue ELSE COALESCE(total_amount,0)-COALESCE(ota_commission_amount,0) END AS room,
      0::numeric AS fee,0::numeric AS refund,0::numeric AS purchase,0::numeric AS laundry,0::numeric AS maintenance
    FROM public.room_bookings WHERE tenant_id=p_tenant AND hotel_id=ANY(p_hotels)
      AND status='checked_out' AND payment_status IS DISTINCT FROM 'refunded'
      AND check_out_date>=p_start AND check_out_date<p_end
    UNION ALL
    SELECT (s.recorded_at AT TIME ZONE p_timezone)::date,0,s.retained_amount,s.refund_due_amount,0,0,0
    FROM private.booking_no_show_resolutions s JOIN public.room_bookings b ON b.id=s.booking_id
      AND b.tenant_id=s.tenant_id AND b.hotel_id=s.hotel_id AND b.room_id=s.room_id AND b.status='no_show'
    WHERE s.tenant_id=p_tenant AND s.hotel_id=ANY(p_hotels)
      AND s.recorded_at>=p_start::timestamp AT TIME ZONE p_timezone
      AND s.recorded_at<p_end::timestamp AT TIME ZONE p_timezone
    UNION ALL
    SELECT (transaction_date AT TIME ZONE p_timezone)::date,0,0,0,COALESCE(total_value,0),0,0
    FROM public.inventory_transactions WHERE tenant_id=p_tenant AND hotel_id=ANY(p_hotels)
      AND transaction_type='in' AND transaction_category='purchase'
      AND transaction_date>=p_start::timestamp AT TIME ZONE p_timezone
      AND transaction_date<p_end::timestamp AT TIME ZONE p_timezone
    UNION ALL
    SELECT (delivery_date AT TIME ZONE p_timezone)::date,0,0,0,0,COALESCE(actual_cost,estimated_cost,0),0
    FROM public.laundry_batches WHERE tenant_id=p_tenant AND hotel_id=ANY(p_hotels)
      AND status IN('delivered','washing','ready','received','stocked','completed')
      AND delivery_date>=p_start::timestamp AT TIME ZONE p_timezone
      AND delivery_date<p_end::timestamp AT TIME ZONE p_timezone
    UNION ALL
    SELECT (completed_at AT TIME ZONE p_timezone)::date,0,0,0,0,0,COALESCE(actual_cost,0)
    FROM public.maintenance_requests WHERE tenant_id=p_tenant AND hotel_id=ANY(p_hotels) AND status='completed'
      AND completed_at>=p_start::timestamp AT TIME ZONE p_timezone
      AND completed_at<p_end::timestamp AT TIME ZONE p_timezone
  ), daily AS (
    SELECT day,sum(room) AS room,sum(fee) AS fee,sum(refund) AS refund,sum(purchase) AS purchase,
      sum(laundry) AS laundry,sum(maintenance) AS maintenance FROM events GROUP BY day
  ), filled AS (
    SELECT d::date AS day,COALESCE(room,0) AS room,COALESCE(fee,0) AS fee,COALESCE(refund,0) AS refund,
      COALESCE(purchase,0) AS purchase,COALESCE(laundry,0) AS laundry,COALESCE(maintenance,0) AS maintenance
    FROM generate_series(p_start::timestamp,(p_end-1)::timestamp,interval '1 day') d LEFT JOIN daily ON day=d::date
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('date',day,'room_net_revenue',room,'no_show_fees',fee,
    'recognized_revenue',room+fee,'refund_due',refund,'purchase_cost',purchase,'laundry_cost',laundry,
    'maintenance_cost',maintenance,'total_cost',purchase+laundry+maintenance,
    'net_profit',room+fee-purchase-laundry-maintenance) ORDER BY day),'[]'::jsonb) FROM filled;
$fn$;
REVOKE ALL ON FUNCTION private.operations_daily_series(uuid,uuid[],date,date,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.read_operations_report(p_hotel uuid,p_start date,p_end date,p_previous_start date,p_previous_end date,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_hotels uuid[];v_previous_start date;v_previous_end date;
  v_yoy_start date;v_yoy_end date;v_rooms bigint;v_result jsonb;
BEGIN
  v_actor:=private.lock_booking_finance_reader(false);
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>3660
    OR p_start<date '1900-01-01' OR p_end>date '2100-12-31'
    OR (p_previous_start IS NULL)<>(p_previous_end IS NULL)
    OR p_timezone IS NULL OR length(p_timezone)>100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'INVALID_OPERATIONS_PERIOD' USING ERRCODE='22023'; END IF;
  v_previous_start:=COALESCE(p_previous_start,p_start-(p_end-p_start+1));
  v_previous_end:=COALESCE(p_previous_end,p_start-1);
  -- Shift inclusive calendar endpoints before making an exclusive bound.
  -- Thus 29 February is compared with 28 February, not an empty interval.
  v_yoy_start:=(p_start-interval '1 year')::date;
  v_yoy_end:=(p_end-interval '1 year')::date;
  IF v_previous_end<v_previous_start OR v_previous_end-v_previous_start>3660
    OR v_previous_start<date '1900-01-01' OR v_previous_end>date '2100-12-31'
    OR v_yoy_start<date '1900-01-01' THEN
    RAISE EXCEPTION 'INVALID_OPERATIONS_PERIOD' USING ERRCODE='22023'; END IF;
  v_hotels:=private.report_assigned_hotels(v_actor,p_hotel);
  SELECT count(*) INTO v_rooms FROM public.rooms WHERE tenant_id=v_actor.tenant_id AND hotel_id=ANY(v_hotels);
  v_result:=jsonb_build_object('version',1,'recognition_timezone',p_timezone,
    'capacity',jsonb_build_object('total_rooms',v_rooms,'method','current_registered_rooms','is_estimate',true),
    'methods',jsonb_build_object('room_revenue','earned_checkout_calendar_date',
      'recognized_revenue','room_net_plus_retained_no_show_fees','cost','purchase_transaction_laundry_delivery_maintenance_completion',
      'adr','earned_checkout_cohort_nights_minimum_one','occupancy','recorded_stay_dates_unique_room_days_estimate',
      'yoy','inclusive_calendar_endpoints_one_year_earlier','profit','before_labor_and_fixed_budget'),
    'current',private.operations_period_summary(v_actor.tenant_id,v_hotels,p_start,p_end+1,p_timezone),
    'previous',private.operations_period_summary(v_actor.tenant_id,v_hotels,v_previous_start,v_previous_end+1,p_timezone),
    'year_ago',private.operations_period_summary(v_actor.tenant_id,v_hotels,v_yoy_start,v_yoy_end+1,p_timezone),
    'daily',private.operations_daily_series(v_actor.tenant_id,v_hotels,p_start,p_end+1,p_timezone));
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.read_operations_report(uuid,date,date,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_operations_report(uuid,date,date,date,date,text) TO authenticated;

CREATE FUNCTION public.get_operations_report_scoped(p_start_date date,p_end_date date,p_hotel_id uuid DEFAULT NULL,
  p_previous_start_date date DEFAULT NULL,p_previous_end_date date DEFAULT NULL,p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.read_operations_report(p_hotel_id,p_start_date,p_end_date,p_previous_start_date,p_previous_end_date,p_timezone);
$fn$;
REVOKE ALL ON FUNCTION public.get_operations_report_scoped(date,date,uuid,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_operations_report_scoped(date,date,uuid,date,date,text) TO authenticated;
