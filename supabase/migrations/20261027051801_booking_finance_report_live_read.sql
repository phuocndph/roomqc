-- Finance is a read capability. It must not require booking mutation rights,
-- expose the private no-show ledger, or mistake deposit classification for cash.
CREATE INDEX roomqc_revenue_checkout_scope ON public.room_bookings(tenant_id,hotel_id,check_out_date)
  WHERE status='checked_out';
CREATE INDEX roomqc_revenue_no_show_scope ON public.room_bookings(tenant_id,hotel_id,id)
  WHERE status='no_show';
CREATE INDEX roomqc_no_show_recognition_scope ON private.booking_no_show_resolutions(tenant_id,hotel_id,recorded_at);

CREATE FUNCTION private.lock_booking_finance_reader(p_allow_booking_update boolean DEFAULT false)
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM 1 FROM public.user_permissions WHERE user_id=v_actor.id ORDER BY id FOR SHARE;
  -- has_user_permission unions all current role assignments, not just the
  -- profile's primary role. Lock exactly that effective grant set as well.
  PERFORM 1 FROM public.roles r JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code IN(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id=v_actor.id)
      AND (r.tenant_id=v_actor.tenant_id OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      AND ((p.module='reports' AND p.action='view') OR
        (p_allow_booking_update AND p.module='bookings' AND p.action IN('update','edit','manage')))
    ORDER BY r.id,p.id FOR SHARE OF r,rp,p;
  IF NOT public.has_user_permission(v_actor.id,'reports','view') AND NOT
    (p_allow_booking_update AND (public.has_user_permission(v_actor.id,'bookings','update')
      OR public.has_user_permission(v_actor.id,'bookings','manage'))) THEN
    RAISE EXCEPTION 'FINANCE_READ_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_booking_finance_reader(boolean) FROM PUBLIC,anon,authenticated,service_role;

-- Called only from the authenticated, scoped report implementation. STABLE
-- helpers share the outer SELECT's snapshot across every period and breakdown.
CREATE FUNCTION private.revenue_booking_summary(p_tenant uuid,p_hotels uuid[],p_start date,p_end date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  WITH b AS (
    SELECT *,payment_status IS DISTINCT FROM 'refunded' AS earned
      FROM public.room_bookings WHERE tenant_id=p_tenant AND hotel_id=ANY(p_hotels)
        AND status='checked_out' AND check_out_date>=p_start AND check_out_date<p_end
  ), totals AS (
    SELECT count(*) AS bookings,count(*) FILTER(WHERE earned AND payment_status='paid') AS paid_bookings,
      COALESCE(sum(COALESCE(amount_paid,0)+COALESCE(deposit_amount,0)) FILTER(WHERE earned),0) AS paid,
      COALESCE(sum(greatest(0,COALESCE(total_amount,0)-COALESCE(amount_paid,0)-COALESCE(deposit_amount,0))) FILTER(WHERE earned),0) AS pending,
      COALESCE(sum(total_amount) FILTER(WHERE NOT earned),0) AS refunded,
      COALESCE(sum(CASE WHEN net_revenue IS NOT NULL AND (net_revenue<>0 OR COALESCE(total_amount,0)=0)
        THEN net_revenue ELSE COALESCE(total_amount,0)-COALESCE(ota_commission_amount,0) END) FILTER(WHERE earned),0) AS net,
      COALESCE(sum(ota_commission_amount) FILTER(WHERE earned),0) AS commission,
      COALESCE(sum(vat_amount) FILTER(WHERE earned),0) AS vat,
      COALESCE(sum(early_checkin_charge) FILTER(WHERE earned),0) AS early,
      COALESCE(sum(late_checkout_charge) FILTER(WHERE earned),0) AS late,
      COALESCE(sum(damage_charges) FILTER(WHERE earned),0) AS damage,
      COALESCE(sum(service_charges) FILTER(WHERE earned),0) AS service,
      COALESCE(sum(extra_charges) FILTER(WHERE earned),0) AS extra FROM b
  ) SELECT jsonb_build_object('totalRevenue',paid+pending,'paidRevenue',paid,'pendingRevenue',pending,
    'refundedRevenue',refunded,'bookingsCount',bookings,'paidBookingsCount',paid_bookings,
    'averageBookingValue',CASE WHEN bookings>0 THEN (paid+pending)/bookings ELSE 0 END,
    'netRevenue',net,'otaCommission',commission,'discountAmount',0,'vatAmount',vat,
    'surcharges',jsonb_build_object('earlyCheckin',early,'lateCheckout',late,'damageCharges',damage,
      'serviceCharges',service,'extraCharges',extra,'total',early+late+damage+service+extra)) FROM totals;
$fn$;
REVOKE ALL ON FUNCTION private.revenue_booking_summary(uuid,uuid[],date,date)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.revenue_no_show_summary(p_tenant uuid,p_hotels uuid[],p_start timestamptz,p_end timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT jsonb_build_object('retainedAmount',COALESCE(sum(s.retained_amount),0),
    'refundDueAmount',COALESCE(sum(s.refund_due_amount),0),'resolutionsCount',count(*),'cashMovement',0)
    FROM private.booking_no_show_resolutions s JOIN public.room_bookings b ON b.id=s.booking_id
      AND b.tenant_id=s.tenant_id AND b.hotel_id=s.hotel_id AND b.room_id=s.room_id AND b.status='no_show'
    WHERE s.tenant_id=p_tenant AND s.hotel_id=ANY(p_hotels) AND s.recorded_at>=p_start AND s.recorded_at<p_end;
$fn$;
REVOKE ALL ON FUNCTION private.revenue_no_show_summary(uuid,uuid[],timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.read_revenue_report(p_hotel_id uuid,p_period text,p_custom_start date,p_custom_end date,p_today date,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_hotels uuid[];v_today date;v_start date;v_end date;
  v_previous_start date;v_previous_end date;v_result jsonb;v_days integer;
BEGIN
  v_actor:=private.lock_booking_finance_reader(false);
  IF p_timezone IS NULL OR length(p_timezone)>100 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone)
    OR p_period IS NULL OR p_period NOT IN('week','month','quarter','year','custom') THEN
    RAISE EXCEPTION 'INVALID_REVENUE_PERIOD' USING ERRCODE='22023'; END IF;
  v_today:=COALESCE(p_today,(clock_timestamp() AT TIME ZONE p_timezone)::date);
  IF v_today NOT BETWEEN date '1900-01-01' AND date '2100-12-31' THEN
    RAISE EXCEPTION 'INVALID_REVENUE_PERIOD' USING ERRCODE='22023'; END IF;
  IF p_period='custom' THEN
    IF p_custom_start IS NULL OR p_custom_end IS NULL OR p_custom_end<p_custom_start
      OR p_custom_end-p_custom_start>3660 OR p_custom_start<date '1900-01-01' OR p_custom_end>date '2100-12-31' THEN
      RAISE EXCEPTION 'INVALID_REVENUE_PERIOD' USING ERRCODE='22023'; END IF;
    v_start:=p_custom_start;v_end:=p_custom_end+1;v_days:=v_end-v_start;
    v_previous_start:=v_start-v_days;v_previous_end:=v_start;
  ELSE
    v_start:=date_trunc(p_period,v_today::timestamp)::date;
    v_end:=(v_start+CASE p_period WHEN 'week' THEN interval '1 week' WHEN 'month' THEN interval '1 month'
      WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END)::date;
    v_previous_start:=(v_start-CASE p_period WHEN 'week' THEN interval '1 week' WHEN 'month' THEN interval '1 month'
      WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END)::date;
    v_previous_end:=v_start;
  END IF;
  PERFORM 1 FROM public.hotels h WHERE h.tenant_id=v_actor.tenant_id AND h.status='active'
    AND (p_hotel_id IS NULL OR h.id=p_hotel_id) AND (v_actor.user_level_code='tenant_owner'
      OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=v_actor.id AND uh.hotel_id=h.id))
    ORDER BY h.id FOR SHARE;
  SELECT array_agg(h.id ORDER BY h.id) INTO v_hotels FROM public.hotels h
    WHERE h.tenant_id=v_actor.tenant_id AND h.status='active' AND (p_hotel_id IS NULL OR h.id=p_hotel_id)
      AND (v_actor.user_level_code='tenant_owner' OR EXISTS(SELECT 1 FROM public.user_hotels uh WHERE uh.user_id=v_actor.id AND uh.hotel_id=h.id));
  IF p_hotel_id IS NOT NULL AND NOT(p_hotel_id=ANY(COALESCE(v_hotels,'{}'::uuid[]))) THEN
    RAISE EXCEPTION 'FINANCE_HOTEL_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  v_hotels:=COALESCE(v_hotels,'{}'::uuid[]);
  PERFORM private.assert_room_transition_session();
  WITH windows AS (
    SELECT 'today' AS label,v_today AS first_day,v_today+1 AS last_day
    UNION ALL SELECT 'currentPeriod',v_start,v_end
    UNION ALL SELECT 'previousPeriod',v_previous_start,v_previous_end
  ), summaries AS (
    SELECT label,private.revenue_booking_summary(v_actor.tenant_id,v_hotels,first_day,last_day) AS room,
      private.revenue_no_show_summary(v_actor.tenant_id,v_hotels,
      first_day::timestamp AT TIME ZONE p_timezone,last_day::timestamp AT TIME ZONE p_timezone) AS no_show FROM windows
  ), monthly AS (
    SELECT m,private.revenue_booking_summary(v_actor.tenant_id,v_hotels,m::date,(m+interval '1 month')::date) AS room,
      private.revenue_no_show_summary(v_actor.tenant_id,v_hotels,m AT TIME ZONE p_timezone,
      (m+interval '1 month') AT TIME ZONE p_timezone) AS no_show
    FROM generate_series(date_trunc('month',v_today::timestamp)-interval '5 months',
      date_trunc('month',v_today::timestamp),interval '1 month') m
  ), current_bookings AS (
    SELECT b.* FROM public.room_bookings b WHERE b.tenant_id=v_actor.tenant_id AND b.hotel_id=ANY(v_hotels)
      AND b.status='checked_out' AND b.payment_status IS DISTINCT FROM 'refunded'
      AND b.check_out_date>=v_start AND b.check_out_date<v_end
  ), by_type AS (
    SELECT COALESCE(booking_type,'daily') AS type,count(*) AS bookings,COALESCE(sum(total_amount),0) AS revenue
      FROM current_bookings GROUP BY COALESCE(booking_type,'daily')
  ), by_source AS (
    SELECT COALESCE(booking_source,'direct') AS source,count(*) AS bookings,COALESCE(sum(total_amount),0) AS gross,
      COALESCE(sum(ota_commission_amount),0) AS commission FROM current_bookings GROUP BY COALESCE(booking_source,'direct')
  ), by_room AS (
    SELECT b.room_id,r.room_number,r.room_type,count(*) AS bookings,COALESCE(sum(b.total_amount),0) AS revenue,
      COALESCE(sum(COALESCE(b.early_checkin_charge,0)+COALESCE(b.late_checkout_charge,0)+COALESCE(b.damage_charges,0)
        +COALESCE(b.service_charges,0)+COALESCE(b.extra_charges,0)),0) AS surcharges
    FROM current_bookings b LEFT JOIN public.rooms r ON r.id=b.room_id AND r.tenant_id=b.tenant_id AND r.hotel_id=b.hotel_id
    GROUP BY b.room_id,r.room_number,r.room_type
  ), review AS (
    SELECT count(*) FILTER(WHERE s.booking_id IS NULL) AS unclassified,
      COALESCE(sum(s.amount_paid),0) AS prepayment
    FROM public.room_bookings b LEFT JOIN private.booking_no_show_resolutions s ON s.booking_id=b.id
      AND s.tenant_id=b.tenant_id AND s.hotel_id=b.hotel_id AND s.room_id=b.room_id
    WHERE b.tenant_id=v_actor.tenant_id AND b.hotel_id=ANY(v_hotels) AND b.status='no_show'
  ) SELECT jsonb_build_object(
    'today',(SELECT room FROM summaries WHERE label='today'),
    'currentPeriod',(SELECT room FROM summaries WHERE label='currentPeriod'),
    'previousPeriod',(SELECT room FROM summaries WHERE label='previousPeriod'),
    'monthlyTrends',(SELECT jsonb_agg(jsonb_build_object('month',to_char(m,'MM/YYYY'),
      'revenue',room->'paidRevenue','bookings',room->'bookingsCount') ORDER BY m) FROM monthly),
    'recognizedMonthlyTrends',(SELECT jsonb_agg(jsonb_build_object('month',to_char(m,'MM/YYYY'),
      'revenue',(room->>'netRevenue')::numeric+(no_show->>'retainedAmount')::numeric,
      'bookings',room->'bookingsCount') ORDER BY m) FROM monthly),
    'revenueGrowth',CASE WHEN (SELECT (room->>'paidRevenue')::numeric FROM summaries WHERE label='previousPeriod')>0
      THEN ((SELECT (room->>'paidRevenue')::numeric FROM summaries WHERE label='currentPeriod') /
        (SELECT (room->>'paidRevenue')::numeric FROM summaries WHERE label='previousPeriod')-1)*100 ELSE 0 END,
    'byType',COALESCE((SELECT jsonb_agg(j) FROM (SELECT jsonb_build_object('type',type,'label',CASE type WHEN 'daily' THEN 'Theo ngày'
      WHEN 'hourly' THEN 'Theo giờ' WHEN 'monthly' THEN 'Theo tháng' ELSE type END,'bookings',bookings,'revenue',revenue,
      'percentage',CASE WHEN sum(revenue) OVER()>0 THEN revenue*100/sum(revenue) OVER() ELSE 0 END) AS j FROM by_type) t),'[]'::jsonb),
    'bySource',COALESCE((SELECT jsonb_agg(j) FROM (SELECT jsonb_build_object('source',source,'bookings',bookings,
      'grossRevenue',gross,'otaCommission',commission,'netRevenue',gross-commission,
      'percentage',CASE WHEN sum(gross) OVER()>0 THEN gross*100/sum(gross) OVER() ELSE 0 END) AS j FROM by_source) s),'[]'::jsonb),
    'topRooms',COALESCE((SELECT jsonb_agg(j ORDER BY total DESC,room_id) FROM (SELECT room_id,revenue AS total,
      jsonb_build_object('roomId',room_id,'roomNumber',COALESCE(room_number,'?'),'roomType',COALESCE(room_type,''),
        'bookings',bookings,'revenue',revenue-surcharges,'surcharges',surcharges,'total',revenue) AS j
      FROM by_room ORDER BY revenue DESC,room_id LIMIT 10) r),'[]'::jsonb),
    'noShow',jsonb_build_object('today',(SELECT no_show FROM summaries WHERE label='today'),
      'currentPeriod',(SELECT no_show FROM summaries WHERE label='currentPeriod'),
      'previousPeriod',(SELECT no_show FROM summaries WHERE label='previousPeriod'),
      'monthlyTrends',(SELECT jsonb_agg(jsonb_build_object('month',to_char(m,'MM/YYYY'),
        'retainedAmount',no_show->'retainedAmount','refundDueAmount',no_show->'refundDueAmount') ORDER BY m) FROM monthly),
      'review',jsonb_build_object('unclassifiedBookings',(SELECT unclassified FROM review),
        'unallocatedPrepaymentAmount',(SELECT prepayment FROM review))),
    'recognitionTimezone',p_timezone,'periodStart',v_start,'periodEnd',v_end-1) INTO v_result;
  -- A long aggregate may outlive JWT/session expiry. Never release its result
  -- after that boundary, even though the actor/grant/hotel rows remain locked.
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.read_revenue_report(uuid,text,date,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_revenue_report(uuid,text,date,date,date,text) TO authenticated;

CREATE FUNCTION public.get_revenue_report(p_hotel_id uuid DEFAULT NULL,p_period text DEFAULT 'month',
  p_custom_start date DEFAULT NULL,p_custom_end date DEFAULT NULL,p_today date DEFAULT NULL,p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.read_revenue_report(p_hotel_id,p_period,p_custom_start,p_custom_end,p_today,p_timezone);
$fn$;
REVOKE ALL ON FUNCTION public.get_revenue_report(uuid,text,date,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_report(uuid,text,date,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_booking_no_show_resolution(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;v_result jsonb;
BEGIN
  v_actor:=private.lock_booking_finance_reader(true);
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id FOR SHARE;
  IF NOT FOUND OR v_booking.tenant_id IS DISTINCT FROM v_actor.tenant_id THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.rooms WHERE id=v_booking.room_id AND tenant_id=v_booking.tenant_id AND hotel_id=v_booking.hotel_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.hotels WHERE id=v_booking.hotel_id AND tenant_id=v_booking.tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND OR (v_actor.user_level_code<>'tenant_owner' AND NOT EXISTS(SELECT 1 FROM public.user_hotels
    WHERE user_id=v_actor.id AND hotel_id=v_booking.hotel_id)) THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('booking_id',booking_id,'id',id,'decision',decision,'deposit_amount',deposit_amount,
    'amount_paid',amount_paid,'retained_amount',retained_amount,'refund_due_amount',refund_due_amount,
    'cash_movement',cash_movement,'recorded_at',recorded_at) INTO v_result
    FROM private.booking_no_show_resolutions WHERE booking_id=p_booking_id
      AND tenant_id=v_booking.tenant_id AND hotel_id=v_booking.hotel_id AND room_id=v_booking.room_id;
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
