
-- Fix quota check function to be VOLATILE instead of STABLE
-- This ensures it always reads fresh data and doesn't cache results

CREATE OR REPLACE FUNCTION check_tenant_can_add(
  p_tenant_id UUID,
  p_resource_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan RECORD;
  v_usage RECORD;
BEGIN
  -- Get tenant's plan limits
  SELECT sp.*
  INTO v_plan
  FROM tenants t
  JOIN subscription_plans sp ON t.subscription_plan_id = sp.id
  WHERE t.id = p_tenant_id;
  
  IF NOT FOUND THEN
    -- Fallback to default free tier limits if no plan assigned
    v_plan := ROW(
      NULL,  -- id
      'Free',  -- name
      1,  -- max_hotels
      3,  -- max_users
      50,  -- max_rooms
      100,  -- max_items
      1  -- max_storage_gb (1GB)
    )::subscription_plans;
  END IF;
  
  -- Get current usage - always fresh, never cached
  SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  
  IF NOT FOUND THEN
    -- If no usage record exists, create it first
    PERFORM update_tenant_usage(p_tenant_id);
    SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  END IF;
  
  -- Check specific resource with proper comparison
  CASE p_resource_type
    WHEN 'hotel' THEN
      RETURN v_plan.max_hotels IS NULL OR v_usage.current_hotels_count < v_plan.max_hotels;
    WHEN 'user' THEN
      RETURN v_plan.max_users IS NULL OR v_usage.current_users_count < v_plan.max_users;
    WHEN 'room' THEN
      RETURN v_plan.max_rooms IS NULL OR v_usage.current_rooms_count < v_plan.max_rooms;
    WHEN 'item' THEN
      RETURN v_plan.max_items IS NULL OR v_usage.current_items_count < v_plan.max_items;
    WHEN 'storage' THEN
      RETURN v_plan.max_storage_gb IS NULL OR (v_usage.current_storage_bytes / 1073741824.0) < v_plan.max_storage_gb;
    ELSE
      RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;  -- Changed from STABLE to VOLATILE

-- Also update the trigger function to add better error context
CREATE OR REPLACE FUNCTION trigger_check_tenant_quota()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_resource_type TEXT;
  v_can_add BOOLEAN;
BEGIN
  -- Determine tenant_id and resource type
  IF TG_TABLE_NAME = 'hotels' THEN
    v_tenant_id := NEW.tenant_id;
    v_resource_type := 'hotel';
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_tenant_id := NEW.tenant_id;
    v_resource_type := 'user';
  ELSIF TG_TABLE_NAME = 'rooms' THEN
    SELECT tenant_id INTO v_tenant_id FROM hotels WHERE id = NEW.hotel_id;
    v_resource_type := 'room';
  ELSIF TG_TABLE_NAME = 'items' THEN
    v_tenant_id := NEW.tenant_id;
    v_resource_type := 'item';
  ELSE
    RETURN NEW;
  END IF;
  
  -- Check quota with fresh data
  v_can_add := check_tenant_can_add(v_tenant_id, v_resource_type);
  
  IF NOT v_can_add THEN
    RAISE EXCEPTION 'Quota exceeded for %. Please upgrade your plan.', v_resource_type;
  END IF;
  
  -- Update usage counter after successful check
  PERFORM update_tenant_usage(v_tenant_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
