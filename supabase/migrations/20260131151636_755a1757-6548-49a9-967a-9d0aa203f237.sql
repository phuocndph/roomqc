-- Create platform_settings table for super admin global configuration
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index on key for fast lookups
CREATE INDEX idx_platform_settings_key ON public.platform_settings(key);

-- Insert default settings
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('trial_period_days', '14', 'Số ngày dùng thử mặc định'),
  ('grace_period_days', '7', 'Số ngày gia hạn sau khi hết hạn'),
  ('default_rooms', '10', 'Số phòng mặc định khi đăng ký'),
  ('price_per_room_day', '1000', 'Giá mỗi phòng mỗi ngày (VND)'),
  ('platform_name', '"Hotel Asset Manager"', 'Tên nền tảng'),
  ('support_email', '"support@example.com"', 'Email hỗ trợ'),
  ('maintenance_mode', 'false', 'Chế độ bảo trì'),
  ('maintenance_message', '""', 'Thông báo bảo trì'),
  ('system_announcement', '""', 'Thông báo hệ thống hiển thị cho tất cả người dùng')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = _user_id 
    AND user_level_code = 'super_admin'
  )
$$;

-- Create RLS policy - Only super admin can manage platform settings
CREATE POLICY "Super admin can view platform settings"
ON public.platform_settings FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can insert platform settings"
ON public.platform_settings FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can update platform settings"
ON public.platform_settings FOR UPDATE
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin can delete platform settings"
ON public.platform_settings FOR DELETE
USING (public.is_super_admin(auth.uid()));