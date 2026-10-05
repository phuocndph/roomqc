-- Tenants: revoke sensitive billing/tax columns from authenticated role
REVOKE SELECT (billing_email, billing_address, tax_id, payment_method) ON public.tenants FROM authenticated;
REVOKE SELECT (billing_email, billing_address, tax_id, payment_method) ON public.tenants FROM anon;

-- Users: revoke salary columns from authenticated role (coworkers should not see salaries)
REVOKE SELECT (monthly_salary_vnd, hourly_wage_vnd) ON public.users FROM authenticated;
REVOKE SELECT (monthly_salary_vnd, hourly_wage_vnd) ON public.users FROM anon;

-- Ensure service_role retains full access for admin/edge function use
GRANT SELECT ON public.tenants TO service_role;
GRANT SELECT ON public.users TO service_role;