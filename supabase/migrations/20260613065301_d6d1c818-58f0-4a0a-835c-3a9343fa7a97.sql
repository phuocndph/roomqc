-- Restrict access to salary columns on public.users
-- Previously any coworker at same hotel could read monthly_salary_vnd / hourly_wage_vnd
-- via the users_select_self_or_tenant RLS policy. Revoke column-level SELECT from the
-- authenticated role so RLS cannot return these columns to general queries.
-- Owner/manager flows must go through a SECURITY DEFINER RPC (to be added when needed).

REVOKE SELECT (monthly_salary_vnd, hourly_wage_vnd) ON public.users FROM authenticated;
REVOKE SELECT (monthly_salary_vnd, hourly_wage_vnd) ON public.users FROM anon;

-- service_role retains full access for edge functions / admin tooling.
GRANT SELECT (monthly_salary_vnd, hourly_wage_vnd) ON public.users TO service_role;