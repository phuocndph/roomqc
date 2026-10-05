-- Phase 1: Operations Insights v2 — Labor cost + Financial targets

-- 1. Wage columns on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hourly_wage_vnd numeric(12,2),
  ADD COLUMN IF NOT EXISTS monthly_salary_vnd numeric(12,2);

GRANT UPDATE (hourly_wage_vnd, monthly_salary_vnd) ON public.users TO authenticated;

-- 2. financial_targets table
CREATE TABLE IF NOT EXISTS public.financial_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('occupancy','revpar','adr','gop_margin','goppar','labor_ratio','net_revenue','gop')),
  target_value numeric(14,2) NOT NULL,
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, hotel_id, period_month, metric)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_targets TO authenticated;
GRANT ALL ON public.financial_targets TO service_role;

ALTER TABLE public.financial_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view targets"
ON public.financial_targets FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.tenant_id = financial_targets.tenant_id
  )
);

CREATE POLICY "Owners and managers can manage targets"
ON public.financial_targets FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.tenant_id = financial_targets.tenant_id
      AND u.user_level_code IN ('super_admin','tenant_owner','manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.tenant_id = financial_targets.tenant_id
      AND u.user_level_code IN ('super_admin','tenant_owner','manager')
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_targets_lookup
  ON public.financial_targets (tenant_id, hotel_id, period_month);

-- 3. RPC: get_labor_cost — tổng lương theo bộ phận từ shift_history × users.wage
CREATE OR REPLACE FUNCTION public.get_labor_cost(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_total numeric := 0;
  v_by_dept jsonb := '{}'::jsonb;
BEGIN
  -- Aggregate labor cost by department
  WITH shifts AS (
    SELECT
      sh.user_id,
      sh.duration_minutes,
      u.hourly_wage_vnd,
      u.monthly_salary_vnd,
      COALESCE(p.department, 'other') AS department
    FROM public.shift_history sh
    JOIN public.users u ON u.id = sh.user_id
    LEFT JOIN public.positions p ON p.id = u.position_id
    WHERE sh.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR sh.hotel_id = p_hotel_id)
      AND sh.start_at >= p_start_date::timestamptz
      AND sh.start_at < (p_end_date::date + 1)::timestamptz
  ),
  costed AS (
    SELECT
      department,
      SUM(
        COALESCE(duration_minutes, 0) / 60.0 *
        COALESCE(
          hourly_wage_vnd,
          monthly_salary_vnd / NULLIF(26.0 * 8.0, 0),
          0
        )
      ) AS dept_cost
    FROM shifts
    GROUP BY department
  )
  SELECT
    COALESCE(SUM(dept_cost), 0),
    COALESCE(jsonb_object_agg(department, ROUND(dept_cost)::numeric), '{}'::jsonb)
  INTO v_total, v_by_dept
  FROM costed;

  v_result := jsonb_build_object(
    'total_labor_cost', ROUND(v_total)::numeric,
    'by_department', v_by_dept
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_labor_cost(uuid, uuid, date, date) TO authenticated;

-- 4. updated_at trigger for financial_targets
CREATE OR REPLACE FUNCTION public.set_financial_targets_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_financial_targets_updated_at ON public.financial_targets;
CREATE TRIGGER trg_financial_targets_updated_at
BEFORE UPDATE ON public.financial_targets
FOR EACH ROW EXECUTE FUNCTION public.set_financial_targets_updated_at();