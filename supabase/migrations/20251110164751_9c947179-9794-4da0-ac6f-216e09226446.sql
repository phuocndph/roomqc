-- ═══════════════════════════════════════════════════════════
-- HOTEL MANAGEMENT - MISSING DATABASE COMPONENTS
-- Adding: user_hotels, custom_fields, email templates, etc.
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. USER-HOTEL MANY-TO-MANY RELATIONSHIP
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_hotels (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hotels_user ON user_hotels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hotels_hotel ON user_hotels(hotel_id);

ALTER TABLE user_hotels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their hotel assignments" ON user_hotels;
CREATE POLICY "Users view their hotel assignments"
ON user_hotels FOR SELECT
USING (
  user_id = auth.uid()
  OR hotel_id IN (
    SELECT h.id FROM hotels h
    WHERE h.tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins manage hotel assignments" ON user_hotels;
CREATE POLICY "Admins manage hotel assignments"
ON user_hotels FOR ALL
USING (
  hotel_id IN (
    SELECT h.id FROM hotels h
    WHERE h.tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND has_role(auth.uid(), 'owner')
);

-- ═══════════════════════════════════════════════════════════
-- 2. CUSTOM FIELDS SYSTEM
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  entity_type TEXT NOT NULL 
    CHECK (entity_type IN (
      'items', 'rooms', 'laundry_batches', 
      'maintenance_requests', 'purchase_orders', 'vendors'
    )),
  
  field_name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  
  field_type TEXT NOT NULL 
    CHECK (field_type IN (
      'text', 'number', 'date', 'boolean', 
      'select', 'multi_select', 'file'
    )),
  
  required BOOLEAN DEFAULT false,
  validation_rule TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  min_length INTEGER,
  max_length INTEGER,
  
  options JSONB,
  default_value TEXT,
  
  display_order INTEGER DEFAULT 0,
  show_in_list BOOLEAN DEFAULT false,
  show_in_filters BOOLEAN DEFAULT false,
  
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, entity_type, field_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(tenant_id, entity_type, status);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view custom fields in their tenant" ON custom_fields;
CREATE POLICY "Users view custom fields in their tenant"
ON custom_fields FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage custom fields" ON custom_fields;
CREATE POLICY "Admins manage custom fields"
ON custom_fields FOR ALL
USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND has_role(auth.uid(), 'owner')
);

-- Custom Field Values
CREATE TABLE IF NOT EXISTS custom_field_values (
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity ON custom_field_values(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_tenant ON custom_field_values(tenant_id);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage custom field values in their tenant" ON custom_field_values;
CREATE POLICY "Users manage custom field values in their tenant"
ON custom_field_values FOR ALL
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- ═══════════════════════════════════════════════════════════
-- 3. EMAIL TEMPLATES & LOGS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL 
    CHECK (category IN (
      'auth', 'inventory', 'laundry', 
      'maintenance', 'purchase', 'reports', 'custom'
    )),
  description TEXT,
  
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  
  available_variables JSONB DEFAULT '[]'::jsonb,
  
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  cc JSONB,
  bcc JSONB,
  
  attachments JSONB DEFAULT '[]'::jsonb,
  
  is_system BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  
  last_edited_by UUID REFERENCES users(id),
  last_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_email_templates_code ON email_templates(code);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view email templates" ON email_templates;
CREATE POLICY "Users view email templates"
ON email_templates FOR SELECT
USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  OR is_system = true
);

DROP POLICY IF EXISTS "Admins manage email templates" ON email_templates;
CREATE POLICY "Admins manage email templates"
ON email_templates FOR ALL
USING (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND has_role(auth.uid(), 'owner')
  AND is_system = false
);

-- Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'sent', 'delivered', 'opened', 
      'clicked', 'failed', 'bounced'
    )),
  
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant_status ON email_logs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs(template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email, created_at DESC);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view email logs in their tenant" ON email_logs;
CREATE POLICY "Users view email logs in their tenant"
ON email_logs FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- ═══════════════════════════════════════════════════════════
-- 4. IMPORT/EXPORT HISTORY
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS import_export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL CHECK (type IN ('import', 'export')),
  data_type TEXT NOT NULL,
  
  user_id UUID NOT NULL REFERENCES users(id),
  
  file_name TEXT,
  format TEXT,
  
  total_rows INTEGER,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  
  filters JSONB,
  
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  source_file_url TEXT,
  output_file_url TEXT,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_export_history ON import_export_history(tenant_id, type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_export_user ON import_export_history(user_id, created_at DESC);

ALTER TABLE import_export_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view import/export history in their tenant" ON import_export_history;
CREATE POLICY "Users view import/export history in their tenant"
ON import_export_history FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users create import/export records" ON import_export_history;
CREATE POLICY "Users create import/export records"
ON import_export_history FOR INSERT
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND user_id = auth.uid()
);

-- ═══════════════════════════════════════════════════════════
-- 5. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Get user's hotels
CREATE OR REPLACE FUNCTION get_user_hotels(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  code TEXT,
  name TEXT,
  city TEXT,
  total_rooms INTEGER,
  status TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT h.id, h.code, h.name, h.city, h.total_rooms, h.status
  FROM hotels h
  INNER JOIN user_hotels uh ON h.id = uh.hotel_id
  WHERE uh.user_id = p_user_id AND h.status = 'active'
  ORDER BY h.name;
END;
$$;

-- Get workflow analytics
CREATE OR REPLACE FUNCTION get_workflow_analytics(
  p_workflow_id UUID,
  p_period TEXT DEFAULT 'month'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  start_date TIMESTAMPTZ;
BEGIN
  start_date := CASE p_period
    WHEN 'day' THEN NOW() - INTERVAL '1 day'
    WHEN 'week' THEN NOW() - INTERVAL '7 days'
    WHEN 'month' THEN NOW() - INTERVAL '30 days'
    WHEN 'year' THEN NOW() - INTERVAL '365 days'
    ELSE NOW() - INTERVAL '30 days'
  END;
  
  SELECT jsonb_build_object(
    'workflow_id', p_workflow_id,
    'period', p_period,
    'total_executions', COUNT(*),
    'successful_executions', COUNT(*) FILTER (WHERE status = 'running'),
    'failed_executions', COUNT(*) FILTER (WHERE status = 'failed'),
    'success_rate', ROUND(
      (COUNT(*) FILTER (WHERE status = 'running')::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
      2
    ),
    'avg_duration_ms', ROUND(AVG(duration_seconds * 1000)),
    'min_duration_ms', MIN(duration_seconds * 1000),
    'max_duration_ms', MAX(duration_seconds * 1000)
  ) INTO result
  FROM workflow_executions
  WHERE workflow_id = p_workflow_id
    AND started_at >= start_date;
  
  RETURN result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 6. SEED DATA
-- ═══════════════════════════════════════════════════════════

-- Insert system email templates
INSERT INTO email_templates (
  tenant_id, code, name, category, subject, 
  html_body, text_body, available_variables, is_system, status
)
SELECT 
  t.id,
  'user_invitation',
  'User Invitation',
  'auth',
  'You are invited to {{hotel_name}}',
  '<h1>Welcome!</h1><p>Hi {{user_name}},</p><p>You have been invited to join {{hotel_name}}.</p><p><a href="{{invite_link}}">Accept Invitation</a></p>',
  'Welcome! Hi {{user_name}}, You have been invited to join {{hotel_name}}. Visit: {{invite_link}}',
  '["user_name", "hotel_name", "invite_link", "expires_at"]'::jsonb,
  true,
  'active'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates WHERE code = 'user_invitation'
);

INSERT INTO email_templates (
  tenant_id, code, name, category, subject, 
  html_body, text_body, available_variables, is_system, status
)
SELECT 
  t.id,
  'low_stock_alert',
  'Low Stock Alert',
  'inventory',
  'Low Stock Alert: {{item_name}}',
  '<h2>Low Stock Alert</h2><p>Item <strong>{{item_name}}</strong> is running low.</p><p>Current stock: {{current_stock}}<br>Minimum required: {{minimum_stock}}</p>',
  'Low Stock Alert: {{item_name}}. Current: {{current_stock}}, Minimum: {{minimum_stock}}',
  '["item_name", "item_code", "current_stock", "minimum_stock", "hotel_name"]'::jsonb,
  true,
  'active'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates WHERE code = 'low_stock_alert'
);