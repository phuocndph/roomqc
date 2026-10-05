
-- Table for automation rules
CREATE TABLE public.reminder_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL CHECK (trigger_type IN ('days_before_expiry', 'subscription_status')),
  trigger_value text NOT NULL,
  action_type text NOT NULL DEFAULT 'send_email' CHECK (action_type IN ('send_email', 'send_sms', 'create_task')),
  action_template text,
  conditions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table for reminder email templates
CREATE TABLE public.reminder_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'renewal',
  content text NOT NULL DEFAULT '',
  variables jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.reminder_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_email_templates ENABLE ROW LEVEL SECURITY;

-- Only super admins can access
CREATE POLICY "Super admins can manage automation rules"
  ON public.reminder_automation_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage reminder templates"
  ON public.reminder_email_templates FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed default automation rules
INSERT INTO public.reminder_automation_rules (name, enabled, trigger_type, trigger_value, action_type, action_template, conditions) VALUES
  ('7 ngày trước hạn - Cảnh báo đầu', true, 'days_before_expiry', '7', 'send_email', 'renewal_7_days', '{"plans": ["premium", "enterprise"]}'),
  ('3 ngày trước hạn - Nhắc gấp', true, 'days_before_expiry', '3', 'send_email', 'renewal_3_days_urgent', '{"plans": ["premium", "enterprise"]}'),
  ('1 ngày trước hạn - Thông báo cuối', true, 'days_before_expiry', '1', 'send_email', 'renewal_1_day_final', '{}'),
  ('Gia hạn - Thanh toán thất bại', true, 'subscription_status', 'grace_period', 'send_email', 'grace_period_payment_failed', '{}');

-- Seed default email templates
INSERT INTO public.reminder_email_templates (name, subject, category, content, variables) VALUES
  ('7 ngày trước hạn', 'Đăng ký của bạn hết hạn trong 7 ngày - {{tenant_name}}', 'renewal', 'Xin chào {{contact_name}}, Đăng ký gói {{plan_name}} của bạn sẽ hết hạn trong 7 ngày vào {{expiry_date}}.', '["tenant_name", "contact_name", "plan_name", "expiry_date", "renewal_link"]'),
  ('3 ngày - Nhắc gấp', 'KHẨN: Đăng ký hết hạn trong 3 ngày - {{tenant_name}}', 'renewal', 'KHẨN CẤP: Đăng ký gói {{plan_name}} sẽ hết hạn trong 3 ngày vào {{expiry_date}}.', '["tenant_name", "contact_name", "plan_name", "expiry_date", "renewal_link"]'),
  ('1 ngày - Thông báo cuối', 'CUỐI CÙNG: Đăng ký hết hạn ngày mai - {{tenant_name}}', 'renewal', 'THÔNG BÁO CUỐI: Đăng ký gói {{plan_name}} hết hạn NGÀY MAI ({{expiry_date}}).', '["tenant_name", "contact_name", "plan_name", "expiry_date", "renewal_link"]'),
  ('Thanh toán thất bại', 'Thanh toán thất bại - Cần hành động - {{tenant_name}}', 'payment', 'Chúng tôi đã cố xử lý thanh toán gia hạn nhưng thất bại. Vui lòng cập nhật phương thức thanh toán.', '["tenant_name", "contact_name", "grace_period_end", "payment_update_link"]');
