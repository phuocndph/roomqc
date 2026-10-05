-- Keep administrative and background-job RPCs out of the public Data API.
--
-- Migration 20260610100032 granted EXECUTE on every SECURITY DEFINER function
-- to `authenticated`.  That broad grant is not safe for functions which can
-- create/promote users, mutate arbitrary tenants, update cron jobs, or process
-- queued side effects.  These functions are called by trusted server-side
-- code (or database triggers), so only `service_role` needs an explicit grant.

REVOKE ALL ON FUNCTION public.create_super_admin(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_super_admin(text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.setup_new_tenant(
  uuid, text, text, text, text, text, text, text, integer
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.setup_new_tenant(
  uuid, text, text, text, text, text, text, text, integer
)
  TO service_role;

REVOKE ALL ON FUNCTION public.exec_cron_update(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_cron_update(text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.refresh_monthly_expenses()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_monthly_expenses()
  TO service_role;

REVOKE ALL ON FUNCTION public.create_default_tenant_roles(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_tenant_roles(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.process_expired_subscriptions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expired_subscriptions()
  TO service_role;

REVOKE ALL ON FUNCTION public.process_room_check_issue_outbox(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_room_check_issue_outbox(integer)
  TO service_role;

COMMENT ON FUNCTION public.create_super_admin(text, text) IS
  'Server-side only: creates or promotes a super-admin account.';
COMMENT ON FUNCTION public.setup_new_tenant(
  uuid, text, text, text, text, text, text, text, integer
) IS
  'Server-side only: provisions a tenant and its first hotel.';
COMMENT ON FUNCTION public.process_room_check_issue_outbox(integer) IS
  'Server-side only: drains room-check side-effect jobs.';
