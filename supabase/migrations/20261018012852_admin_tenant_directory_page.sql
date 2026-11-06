-- Read-only directory: filters/count run before the bounded page; financial and
-- activity aggregates run inside Postgres, never on a truncated REST rowset.
CREATE INDEX IF NOT EXISTS admin_tenant_directory_created_idx ON public.tenants(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS admin_tenant_directory_paid_idx ON public.invoices(tenant_id) INCLUDE(total_amount) WHERE status='paid';
CREATE INDEX IF NOT EXISTS admin_tenant_directory_activity_idx ON public.activity_logs(tenant_id,created_at DESC NULLS LAST);

CREATE FUNCTION public.admin_tenant_directory_page(
  p_page integer DEFAULT 0, p_page_size integer DEFAULT 25,
  p_search text DEFAULT '', p_status text DEFAULT 'all',
  p_plan uuid DEFAULT NULL, p_approval text DEFAULT 'all',
  p_sort text DEFAULT 'created_at', p_desc boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $fn$
DECLARE v_now timestamptz := now(); v_result jsonb;
BEGIN
  PERFORM private.require_reconciliation_case_actor();
  IF p_page IS NULL OR p_page<0 OR p_page>1000000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR p_search IS NULL OR char_length(p_search)>200
    OR p_status IS NULL OR p_status NOT IN ('all','active','trial','expired','not_registered','expiring_soon','cancelled','suspended','grace_period','past_due')
    OR p_approval IS NULL OR p_approval NOT IN ('all','approved','pending','rejected')
    OR p_sort IS NULL OR p_sort NOT IN ('created_at','name','subscription_end_date') OR p_desc IS NULL THEN
    RAISE EXCEPTION 'INVALID_TENANT_DIRECTORY_PARAMETERS' USING ERRCODE='22023';
  END IF;
  WITH filtered AS MATERIALIZED (
    SELECT t.*,
      CASE WHEN t.subscription_status='active' AND t.subscription_end_date<v_now::date THEN 'expired'
        ELSE coalesce(t.subscription_status,'not_registered') END AS actual_status,
      coalesce(t.subscription_end_date<v_now::date,false) AS is_expired,
      t.subscription_end_date-v_now::date AS days_until_expiry,
      coalesce(t.registered_rooms>0 AND t.subscription_end_date IS NOT NULL,false) AS has_subscription
    FROM public.tenants t
    WHERE (p_plan IS NULL OR t.subscription_plan_id=p_plan)
      AND (p_approval='all' OR t.approval_status=p_approval)
      -- strpos treats %, _ and backslash as literal user text, not LIKE patterns.
      AND (btrim(p_search)='' OR strpos(lower(t.name),lower(btrim(p_search)))>0
        OR strpos(lower(coalesce(t.email,'')),lower(btrim(p_search)))>0)
  ), matching AS MATERIALIZED (
    SELECT * FROM filtered f WHERE p_status='all' OR f.actual_status=p_status
      OR (p_status='expiring_soon' AND f.actual_status='active' AND f.days_until_expiry>=0 AND f.days_until_expiry<=7)
  ), totals AS (SELECT count(*) AS total FROM matching), bounds AS (
    SELECT total, least(p_page,greatest(0,ceil(total::numeric/p_page_size)::integer-1)) AS page FROM totals
  ), page_rows AS MATERIALIZED (
    SELECT m.*, row_number() OVER (ORDER BY
      CASE WHEN p_sort='name' AND NOT p_desc THEN m.name END ASC NULLS LAST,
      CASE WHEN p_sort='name' AND p_desc THEN m.name END DESC NULLS LAST,
      CASE WHEN p_sort='subscription_end_date' AND NOT p_desc THEN m.subscription_end_date END ASC NULLS LAST,
      CASE WHEN p_sort='subscription_end_date' AND p_desc THEN m.subscription_end_date END DESC NULLS LAST,
      CASE WHEN p_sort='created_at' AND NOT p_desc THEN m.created_at END ASC NULLS LAST,
      CASE WHEN p_sort='created_at' AND p_desc THEN m.created_at END DESC NULLS LAST,
      m.id DESC) AS directory_position
    FROM matching m ORDER BY directory_position
    LIMIT p_page_size OFFSET ((SELECT page FROM bounds)*p_page_size)
  ), rendered AS (
    SELECT p.directory_position AS position,
      (to_jsonb(p)-'subscription_plan'-'directory_position') || jsonb_build_object(
        'subscription_plan', CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id',sp.id,'name',sp.name,'code',sp.code,'price_monthly',sp.price_monthly,'price_yearly',sp.price_yearly,
          'max_hotels',sp.max_hotels,'max_users',sp.max_users,'max_storage_gb',sp.max_storage_gb) END,
        'tenant_usage',coalesce((SELECT jsonb_agg(to_jsonb(u)-'tenant_id'-'id') FROM public.tenant_usage u WHERE u.tenant_id=p.id),'[]'::jsonb),
        'lifetime_revenue',(SELECT coalesce(sum(i.total_amount),0) FROM public.invoices i WHERE i.tenant_id=p.id AND i.status='paid'),
        'last_activity',(SELECT a.created_at FROM public.activity_logs a WHERE a.tenant_id=p.id ORDER BY a.created_at DESC NULLS LAST LIMIT 1)
      ) AS item
    FROM page_rows p LEFT JOIN public.subscription_plans sp ON sp.id=p.subscription_plan_id
  ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM rendered),'[]'::jsonb),
    'total',b.total,'page',b.page,'page_size',p_page_size,'checked_at',v_now,
    'plans',coalesce((SELECT jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.name) ORDER BY sp.name,sp.id)
      FROM public.subscription_plans sp WHERE EXISTS(SELECT 1 FROM public.tenants t WHERE t.subscription_plan_id=sp.id)),'[]'::jsonb))
    INTO v_result FROM bounds b;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_tenant_directory_page(integer,integer,text,text,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_tenant_directory_page(integer,integer,text,text,uuid,text,text,boolean) TO authenticated;
COMMENT ON FUNCTION public.admin_tenant_directory_page(integer,integer,text,text,uuid,text,text,boolean)
  IS 'Live support-admin session required. Bounded directory page and exact filtered count; paid-invoice sum is not a settlement ledger.';
