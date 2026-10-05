-- Regression guard for server-side-only SECURITY DEFINER functions.
-- Safe to run against local/staging databases: this test is read-only.

\set ON_ERROR_STOP on

SELECT plan(28);

WITH protected(signature) AS (
  VALUES
    ('public.create_super_admin(text,text)'),
    ('public.setup_new_tenant(uuid,text,text,text,text,text,text,text,integer)'),
    ('public.exec_cron_update(text,text)'),
    ('public.refresh_monthly_expenses()'),
    ('public.create_default_tenant_roles(uuid)'),
    ('public.process_expired_subscriptions()'),
    ('public.process_room_check_issue_outbox(integer)')
)
SELECT ok(to_regprocedure(signature) IS NOT NULL, 'function exists: ' || signature)
FROM protected;

WITH protected(signature) AS (
  VALUES
    ('public.create_super_admin(text,text)'),
    ('public.setup_new_tenant(uuid,text,text,text,text,text,text,text,integer)'),
    ('public.exec_cron_update(text,text)'),
    ('public.refresh_monthly_expenses()'),
    ('public.create_default_tenant_roles(uuid)'),
    ('public.process_expired_subscriptions()'),
    ('public.process_room_check_issue_outbox(integer)')
)
SELECT ok(NOT has_function_privilege('anon', signature, 'EXECUTE'), 'anon denied: ' || signature)
FROM protected;

WITH protected(signature) AS (
  VALUES
    ('public.create_super_admin(text,text)'),
    ('public.setup_new_tenant(uuid,text,text,text,text,text,text,text,integer)'),
    ('public.exec_cron_update(text,text)'),
    ('public.refresh_monthly_expenses()'),
    ('public.create_default_tenant_roles(uuid)'),
    ('public.process_expired_subscriptions()'),
    ('public.process_room_check_issue_outbox(integer)')
)
SELECT ok(NOT has_function_privilege('authenticated', signature, 'EXECUTE'), 'authenticated denied: ' || signature)
FROM protected;

WITH protected(signature) AS (
  VALUES
    ('public.create_super_admin(text,text)'),
    ('public.setup_new_tenant(uuid,text,text,text,text,text,text,text,integer)'),
    ('public.exec_cron_update(text,text)'),
    ('public.refresh_monthly_expenses()'),
    ('public.create_default_tenant_roles(uuid)'),
    ('public.process_expired_subscriptions()'),
    ('public.process_room_check_issue_outbox(integer)')
)
SELECT ok(has_function_privilege('service_role', signature, 'EXECUTE'), 'service_role allowed: ' || signature)
FROM protected;

SELECT * FROM finish();
