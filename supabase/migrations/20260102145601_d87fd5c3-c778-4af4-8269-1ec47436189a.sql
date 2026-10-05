-- Create bank payment settings table for storing bank account info
CREATE TABLE public.bank_payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  payment_prefix TEXT DEFAULT 'HD-',
  qr_template TEXT DEFAULT 'compact',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bank_payment_settings ENABLE ROW LEVEL SECURITY;

-- Super admins can manage bank settings
CREATE POLICY "Super admins can manage bank settings"
ON public.bank_payment_settings
FOR ALL
USING (is_super_admin());

-- Authenticated users can view active bank settings
CREATE POLICY "Authenticated users can view active bank settings"
ON public.bank_payment_settings
FOR SELECT
USING (is_active = true AND auth.role() = 'authenticated');

-- Create trigger for updated_at
CREATE TRIGGER update_bank_payment_settings_updated_at
BEFORE UPDATE ON public.bank_payment_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();