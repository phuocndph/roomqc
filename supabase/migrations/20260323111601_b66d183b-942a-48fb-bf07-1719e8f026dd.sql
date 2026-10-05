
-- 1. Insert free_trial plan
INSERT INTO subscription_plans (id, code, name, description, max_rooms, max_hotels, max_users, is_active, display_order)
VALUES (
  gen_random_uuid(),
  'free_trial',
  'Dùng thử miễn phí',
  'Chương trình hỗ trợ chuyển đổi số - Miễn phí 5 tháng',
  50,
  2,
  10,
  true,
  0
);

-- 2. Update approve_tenant to auto-assign free_trial plan
CREATE OR REPLACE FUNCTION public.approve_tenant(p_tenant_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_trial_plan_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only Super Admin can approve tenants');
  END IF;

  -- Get free_trial plan id
  SELECT id INTO v_trial_plan_id FROM subscription_plans WHERE code = 'free_trial' AND is_active = true LIMIT 1;

  UPDATE tenants
  SET
    approval_status = 'approved',
    approved_by = p_admin_id,
    approved_at = NOW(),
    subscription_plan_id = COALESCE(subscription_plan_id, v_trial_plan_id),
    subscription_status = COALESCE(subscription_status, 'trial'),
    subscription_start_date = COALESCE(subscription_start_date, CURRENT_DATE),
    subscription_end_date = COALESCE(subscription_end_date, (CURRENT_DATE + INTERVAL '5 months')::date),
    subscription_current_period_start = COALESCE(subscription_current_period_start, NOW()),
    subscription_current_period_end = COALESCE(subscription_current_period_end, NOW() + INTERVAL '5 months'),
    subscription_duration_days = COALESCE(subscription_duration_days, 150),
    registered_rooms = COALESCE(NULLIF(registered_rooms, 0), 50)
  WHERE id = p_tenant_id AND approval_status = 'pending';

  IF FOUND THEN
    UPDATE users
    SET status = 'active'
    WHERE tenant_id = p_tenant_id AND user_level_code = 'tenant_owner';

    RETURN jsonb_build_object('success', true, 'message', 'Tenant approved successfully with free trial');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Tenant not found or already processed');
  END IF;
END;
$function$;

-- 3. Backfill existing approved tenants without a plan
UPDATE tenants
SET
  subscription_plan_id = (SELECT id FROM subscription_plans WHERE code = 'free_trial' AND is_active = true LIMIT 1),
  subscription_status = 'trial',
  subscription_start_date = COALESCE(approved_at::date, created_at::date),
  subscription_end_date = COALESCE((approved_at + INTERVAL '5 months')::date, (created_at + INTERVAL '5 months')::date),
  subscription_current_period_start = COALESCE(approved_at, created_at),
  subscription_current_period_end = COALESCE(approved_at + INTERVAL '5 months', created_at + INTERVAL '5 months'),
  subscription_duration_days = 150,
  registered_rooms = CASE WHEN COALESCE(registered_rooms, 0) = 0 THEN 50 ELSE registered_rooms END
WHERE subscription_plan_id IS NULL
  AND approval_status = 'approved';
