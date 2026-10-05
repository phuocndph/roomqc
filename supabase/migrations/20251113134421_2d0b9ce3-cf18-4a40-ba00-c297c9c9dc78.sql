
-- Fix the type casting error in check_tenant_can_add function
CREATE OR REPLACE FUNCTION check_tenant_can_add(
  p_tenant_id UUID,
  p_resource_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_tenant RECORD;
  v_usage RECORD;
  v_max_value INTEGER;
  v_current_value INTEGER;
BEGIN
  -- Get tenant with subscription plan details in one query
  SELECT 
    t.id,
    t.name,
    sp.max_hotels,
    sp.max_users,
    sp.max_rooms,
    sp.max_items,
    sp.max_storage_gb
  INTO v_tenant
  FROM tenants t
  LEFT JOIN subscription_plans sp ON t.subscription_plan_id = sp.id
  WHERE t.id = p_tenant_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;
  
  -- Get current usage - always fresh
  SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  
  IF NOT FOUND THEN
    -- If no usage record exists, create it first
    PERFORM update_tenant_usage(p_tenant_id);
    SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  END IF;
  
  -- Determine max and current values based on resource type
  CASE p_resource_type
    WHEN 'hotel' THEN
      v_max_value := v_tenant.max_hotels;
      v_current_value := v_usage.current_hotels_count;
    WHEN 'user' THEN
      v_max_value := v_tenant.max_users;
      v_current_value := v_usage.current_users_count;
    WHEN 'room' THEN
      v_max_value := v_tenant.max_rooms;
      v_current_value := v_usage.current_rooms_count;
    WHEN 'item' THEN
      v_max_value := v_tenant.max_items;
      v_current_value := v_usage.current_items_count;
    WHEN 'storage' THEN
      v_max_value := v_tenant.max_storage_gb;
      v_current_value := (v_usage.current_storage_bytes / 1073741824.0)::INTEGER;
    ELSE
      RETURN false;
  END CASE;
  
  -- NULL means unlimited
  IF v_max_value IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if current usage is below limit
  RETURN v_current_value < v_max_value;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
