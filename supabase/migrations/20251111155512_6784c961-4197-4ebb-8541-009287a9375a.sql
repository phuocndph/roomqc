-- =====================================================
-- PHASE 3: USAGE TRACKING & QUOTAS
-- =====================================================

-- TENANT USAGE TRACKING (Real-time usage)
CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  
  -- Current usage
  current_hotels_count INTEGER DEFAULT 0,
  current_users_count INTEGER DEFAULT 0,
  current_rooms_count INTEGER DEFAULT 0,
  current_items_count INTEGER DEFAULT 0,
  current_storage_bytes BIGINT DEFAULT 0,
  
  -- Historical peak usage
  peak_hotels_count INTEGER DEFAULT 0,
  peak_users_count INTEGER DEFAULT 0,
  peak_storage_bytes BIGINT DEFAULT 0,
  
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenant owners can view their usage"
  ON tenant_usage FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Initialize usage for existing tenants
INSERT INTO tenant_usage (tenant_id, current_hotels_count, current_users_count, current_rooms_count, current_items_count)
SELECT 
  t.id,
  (SELECT COUNT(*) FROM hotels WHERE tenant_id = t.id AND status = 'active'),
  (SELECT COUNT(*) FROM users WHERE tenant_id = t.id),
  (SELECT COUNT(*) FROM rooms r JOIN hotels h ON r.hotel_id = h.id WHERE h.tenant_id = t.id),
  (SELECT COUNT(*) FROM items i JOIN hotels h ON i.hotel_id = h.id WHERE h.tenant_id = t.id)
FROM tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- Function: Calculate storage used by tenant
CREATE OR REPLACE FUNCTION calculate_tenant_storage(p_tenant_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_storage BIGINT := 0;
BEGIN
  -- Sum up image sizes from item_images
  SELECT COALESCE(SUM(file_size), 0)
  INTO v_storage
  FROM item_images ii
  JOIN items i ON ii.item_id = i.id
  WHERE i.tenant_id = p_tenant_id;
  
  RETURN v_storage;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Update tenant usage counts
CREATE OR REPLACE FUNCTION update_tenant_usage(p_tenant_id UUID)
RETURNS VOID AS $$
DECLARE
  v_hotels INTEGER;
  v_users INTEGER;
  v_rooms INTEGER;
  v_items INTEGER;
  v_storage BIGINT;
BEGIN
  -- Count hotels
  SELECT COUNT(*) INTO v_hotels
  FROM hotels
  WHERE tenant_id = p_tenant_id AND status = 'active';
  
  -- Count users
  SELECT COUNT(*) INTO v_users
  FROM users
  WHERE tenant_id = p_tenant_id;
  
  -- Count rooms
  SELECT COUNT(*) INTO v_rooms
  FROM rooms r
  JOIN hotels h ON r.hotel_id = h.id
  WHERE h.tenant_id = p_tenant_id;
  
  -- Count items
  SELECT COUNT(*) INTO v_items
  FROM items i
  WHERE i.tenant_id = p_tenant_id;
  
  -- Calculate storage
  v_storage := calculate_tenant_storage(p_tenant_id);
  
  -- Update or insert
  INSERT INTO tenant_usage (
    tenant_id,
    current_hotels_count,
    current_users_count,
    current_rooms_count,
    current_items_count,
    current_storage_bytes,
    last_calculated_at
  ) VALUES (
    p_tenant_id,
    v_hotels,
    v_users,
    v_rooms,
    v_items,
    v_storage,
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    current_hotels_count = EXCLUDED.current_hotels_count,
    current_users_count = EXCLUDED.current_users_count,
    current_rooms_count = EXCLUDED.current_rooms_count,
    current_items_count = EXCLUDED.current_items_count,
    current_storage_bytes = EXCLUDED.current_storage_bytes,
    peak_hotels_count = GREATEST(tenant_usage.peak_hotels_count, EXCLUDED.current_hotels_count),
    peak_users_count = GREATEST(tenant_usage.peak_users_count, EXCLUDED.current_users_count),
    peak_storage_bytes = GREATEST(tenant_usage.peak_storage_bytes, EXCLUDED.current_storage_bytes),
    last_calculated_at = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if tenant can perform action (quota check)
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
    RETURN false;
  END IF;
  
  -- Get current usage
  SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  
  IF NOT FOUND THEN
    PERFORM update_tenant_usage(p_tenant_id);
    SELECT * INTO v_usage FROM tenant_usage WHERE tenant_id = p_tenant_id;
  END IF;
  
  -- Check specific resource
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trigger: Block creation if quota exceeded
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
  
  -- Check quota
  v_can_add := check_tenant_can_add(v_tenant_id, v_resource_type);
  
  IF NOT v_can_add THEN
    RAISE EXCEPTION 'Quota exceeded for %. Please upgrade your plan.', v_resource_type;
  END IF;
  
  -- Update usage counter
  PERFORM update_tenant_usage(v_tenant_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply quota check triggers
DROP TRIGGER IF EXISTS trg_check_hotel_quota ON hotels;
CREATE TRIGGER trg_check_hotel_quota
  BEFORE INSERT ON hotels
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_tenant_quota();

DROP TRIGGER IF EXISTS trg_check_user_quota ON users;
CREATE TRIGGER trg_check_user_quota
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_tenant_quota();

DROP TRIGGER IF EXISTS trg_check_room_quota ON rooms;
CREATE TRIGGER trg_check_room_quota
  BEFORE INSERT ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_tenant_quota();

DROP TRIGGER IF EXISTS trg_check_item_quota ON items;
CREATE TRIGGER trg_check_item_quota
  BEFORE INSERT ON items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_tenant_quota();

-- =====================================================
-- MANAGER & STAFF PERMISSIONS
-- =====================================================

-- Enhance user_hotels table
ALTER TABLE user_hotels
ADD COLUMN IF NOT EXISTS can_create_managers BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_create_staff BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_view_reports BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_export_data BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_approve_requests BOOLEAN DEFAULT false;

-- Staff statistics tracking
CREATE TABLE IF NOT EXISTS staff_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  
  -- Aggregated stats
  laundry_batches_processed INTEGER DEFAULT 0,
  maintenance_tasks_completed INTEGER DEFAULT 0,
  items_checked INTEGER DEFAULT 0,
  
  -- Performance metrics
  average_task_completion_time INTERVAL,
  on_time_completion_rate NUMERIC(5,2),
  
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_staff_stats_period UNIQUE (user_id, hotel_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_staff_statistics_user_id ON staff_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_statistics_hotel_id ON staff_statistics(hotel_id);
CREATE INDEX IF NOT EXISTS idx_staff_statistics_period ON staff_statistics(period_start, period_end);

-- Enable RLS
ALTER TABLE staff_statistics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view staff statistics from their tenant"
  ON staff_statistics FOR SELECT
  USING (
    hotel_id IN (
      SELECT h.id FROM hotels h
      JOIN users u ON u.tenant_id = h.tenant_id
      WHERE u.id = auth.uid()
    )
  );

-- Function: Calculate staff statistics
CREATE OR REPLACE FUNCTION calculate_staff_statistics(
  p_user_id UUID,
  p_hotel_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS VOID AS $$
DECLARE
  v_laundry_count INTEGER;
  v_maintenance_count INTEGER;
BEGIN
  -- Count laundry batches processed
  SELECT COUNT(*) INTO v_laundry_count
  FROM laundry_batches
  WHERE hotel_id = p_hotel_id
    AND delivery_staff_id = p_user_id
    AND status = 'received'
    AND delivery_date BETWEEN p_period_start AND p_period_end;
  
  -- Count maintenance tasks completed
  SELECT COUNT(*) INTO v_maintenance_count
  FROM maintenance_requests
  WHERE hotel_id = p_hotel_id
    AND assigned_to = p_user_id
    AND status = 'completed'
    AND completed_at BETWEEN p_period_start AND p_period_end;
  
  -- Insert or update statistics
  INSERT INTO staff_statistics (
    user_id,
    hotel_id,
    laundry_batches_processed,
    maintenance_tasks_completed,
    period_start,
    period_end,
    last_calculated_at
  ) VALUES (
    p_user_id,
    p_hotel_id,
    v_laundry_count,
    v_maintenance_count,
    p_period_start,
    p_period_end,
    now()
  )
  ON CONFLICT (user_id, hotel_id, period_start, period_end) DO UPDATE SET
    laundry_batches_processed = EXCLUDED.laundry_batches_processed,
    maintenance_tasks_completed = EXCLUDED.maintenance_tasks_completed,
    last_calculated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- NOTIFICATIONS & ALERTS
-- =====================================================

-- Email notifications queue
CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  
  -- Email content
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  
  -- Type
  notification_type TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  
  -- Sending details
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_notifications_type ON email_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at ON email_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their email notifications"
  ON email_notifications FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    OR user_id = auth.uid()
  );

-- Function: Queue email notification
CREATE OR REPLACE FUNCTION queue_email_notification(
  p_tenant_id UUID,
  p_user_id UUID,
  p_to_email TEXT,
  p_subject TEXT,
  p_body_html TEXT,
  p_notification_type TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO email_notifications (
    tenant_id,
    user_id,
    to_email,
    subject,
    body_html,
    notification_type,
    metadata
  ) VALUES (
    p_tenant_id,
    p_user_id,
    p_to_email,
    p_subject,
    p_body_html,
    p_notification_type,
    p_metadata
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check subscriptions expiring soon
CREATE OR REPLACE FUNCTION check_expiring_subscriptions()
RETURNS VOID AS $$
DECLARE
  v_tenant RECORD;
  v_days_until_expiry INTEGER;
  v_subject TEXT;
  v_body TEXT;
BEGIN
  FOR v_tenant IN
    SELECT 
      t.id,
      t.name,
      t.subscription_current_period_end,
      u.email,
      u.full_name
    FROM tenants t
    JOIN users u ON t.id = u.tenant_id AND u.user_level_code = 'tenant_owner'
    WHERE t.subscription_status = 'active'
      AND t.subscription_current_period_end IS NOT NULL
      AND t.subscription_current_period_end BETWEEN now() AND now() + interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM email_notifications
        WHERE tenant_id = t.id
          AND notification_type = 'subscription_expiring'
          AND created_at > now() - interval '1 day'
      )
  LOOP
    v_days_until_expiry := EXTRACT(DAY FROM v_tenant.subscription_current_period_end - now());
    
    v_subject := 'Gói dịch vụ của bạn sẽ hết hạn trong ' || v_days_until_expiry || ' ngày';
    v_body := '<h2>Xin chào ' || COALESCE(v_tenant.full_name, 'bạn') || ',</h2>' ||
              '<p>Gói dịch vụ của <strong>' || v_tenant.name || '</strong> sẽ hết hạn vào <strong>' || 
              TO_CHAR(v_tenant.subscription_current_period_end, 'DD/MM/YYYY') || '</strong>.</p>' ||
              '<p>Vui lòng gia hạn để tiếp tục sử dụng dịch vụ không bị gián đoạn.</p>';
    
    PERFORM queue_email_notification(
      v_tenant.id,
      NULL,
      v_tenant.email,
      v_subject,
      v_body,
      'subscription_expiring',
      jsonb_build_object('days_until_expiry', v_days_until_expiry)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;