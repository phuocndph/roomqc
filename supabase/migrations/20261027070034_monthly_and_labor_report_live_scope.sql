-- Preserve legacy shapes while removing caller-selected tenant/hotel authority.
-- The monthly dashboard and financial report share one cost recognition contract.
CREATE FUNCTION private.read_monthly_cost_report(p_tenant uuid,p_months integer,p_hotel uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_first date;v_last date;
BEGIN
  IF p_months IS NULL OR p_months<1 OR p_months>120 THEN
    RAISE EXCEPTION 'INVALID_MONTHLY_REPORT_PERIOD' USING ERRCODE='22023'; END IF;
  v_first:=(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')
    - make_interval(months=>p_months-1))::date;
  v_last:=(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '1 month')::date-1;
  RETURN private.read_financial_report(p_tenant,p_hotel,v_first,v_last,'Asia/Ho_Chi_Minh',false)->'monthly_trend';
END;
$fn$;
REVOKE ALL ON FUNCTION private.read_monthly_cost_report(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_monthly_cost_report(uuid,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_monthly_expenses(p_tenant_id uuid,p_months integer,p_hotel_id uuid DEFAULT NULL)
RETURNS TABLE(month text,purchase bigint,laundry bigint,maintenance bigint,total bigint)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT to_char(to_date(m->>'month','MM/YYYY'),'Mon'),(m->>'purchase')::numeric::bigint,
    (m->>'laundry')::numeric::bigint,(m->>'maintenance')::numeric::bigint,
    ((m->>'purchase')::numeric+(m->>'laundry')::numeric+(m->>'maintenance')::numeric)::bigint
    FROM jsonb_array_elements(private.read_monthly_cost_report(p_tenant_id,p_months,p_hotel_id)) m;
$fn$;
REVOKE ALL ON FUNCTION public.get_monthly_expenses(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_monthly_expenses(uuid,integer,uuid) TO authenticated;

-- Aggregated labor is an estimate from recorded shift duration and configured
-- wage, not payroll, cash paid or the fixed monthly budget. Never return wages.
CREATE FUNCTION private.read_labor_cost_report(p_tenant uuid,p_hotel uuid,p_start date,p_end date,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_hotels uuid[];v_result jsonb;
BEGIN
  v_actor:=private.lock_booking_finance_reader(false);
  IF p_tenant IS NOT NULL AND p_tenant IS DISTINCT FROM v_actor.tenant_id THEN
    RAISE EXCEPTION 'FINANCE_TENANT_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>3660
    OR p_start<date '1900-01-01' OR p_end>date '2100-12-31'
    OR p_timezone IS NULL OR length(p_timezone)>100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'INVALID_LABOR_REPORT_PERIOD' USING ERRCODE='22023'; END IF;
  v_hotels:=private.report_assigned_hotels(v_actor,p_hotel);
  WITH costs AS (
    SELECT COALESCE(p.department,'other') AS department,
      round(sum(COALESCE(sh.duration_minutes,0)/60.0 * COALESCE(u.hourly_wage_vnd,u.monthly_salary_vnd/208.0,0))) AS amount
    FROM public.shift_history sh JOIN public.users u ON u.id=sh.user_id AND u.tenant_id=v_actor.tenant_id
    LEFT JOIN public.positions p ON p.id=u.position_id AND p.tenant_id=v_actor.tenant_id
    WHERE sh.tenant_id=v_actor.tenant_id AND sh.hotel_id=ANY(v_hotels)
      AND sh.start_at>=p_start::timestamp AT TIME ZONE p_timezone
      AND sh.start_at<(p_end+1)::timestamp AT TIME ZONE p_timezone
    GROUP BY COALESCE(p.department,'other')
  ) SELECT jsonb_build_object('total_labor_cost',COALESCE(sum(amount),0),
      'by_department',COALESCE(jsonb_object_agg(department,amount),'{}'::jsonb),
      'method','shift_start_duration_wage_estimate','is_estimate',true,
      'period_start',p_start,'period_end',p_end,'recognition_timezone',p_timezone)
    INTO v_result FROM costs;
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.read_labor_cost_report(uuid,uuid,date,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_labor_cost_report(uuid,uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_labor_cost(p_tenant_id uuid,p_hotel_id uuid,p_start_date date,p_end_date date)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.read_labor_cost_report(p_tenant_id,p_hotel_id,p_start_date,p_end_date,'Asia/Ho_Chi_Minh');
$fn$;
REVOKE ALL ON FUNCTION public.get_labor_cost(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_labor_cost(uuid,uuid,date,date) TO authenticated;
CREATE FUNCTION public.get_labor_cost_scoped(p_start_date date,p_end_date date,p_hotel_id uuid DEFAULT NULL,
  p_timezone text DEFAULT 'Asia/Ho_Chi_Minh')
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT private.read_labor_cost_report(NULL,p_hotel_id,p_start_date,p_end_date,p_timezone);
$fn$;
REVOKE ALL ON FUNCTION public.get_labor_cost_scoped(date,date,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_labor_cost_scoped(date,date,uuid,text) TO authenticated;
