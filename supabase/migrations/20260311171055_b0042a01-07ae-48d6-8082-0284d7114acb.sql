
-- Feature 1: Guests table
CREATE TABLE public.guests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_type TEXT,
  id_number TEXT,
  nationality TEXT,
  gender TEXT,
  date_of_birth DATE,
  address TEXT,
  id_image_url TEXT,
  vip_level TEXT NOT NULL DEFAULT 'normal',
  notes TEXT,
  total_stays INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  last_stay_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for guests" ON public.guests
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

ALTER TABLE public.room_bookings ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL;

-- Feature 2: Lost & Found
CREATE TABLE public.lost_found_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  item_code TEXT,
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  found_location TEXT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  found_date DATE NOT NULL DEFAULT CURRENT_DATE,
  found_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'stored',
  claimed_by_name TEXT,
  claimed_by_phone TEXT,
  claimed_date DATE,
  storage_location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lost_found_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for lost_found_items" ON public.lost_found_items
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

-- Feature 3: Guest Invoices
CREATE TABLE public.guest_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.room_bookings(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_address TEXT,
  guest_tax_code TEXT,
  company_name TEXT,
  room_number TEXT,
  check_in_date DATE,
  check_out_date DATE,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 0.1,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  service_fee_rate NUMERIC NOT NULL DEFAULT 0,
  service_fee_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for guest_invoices" ON public.guest_invoices
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE OR REPLACE FUNCTION public.generate_guest_invoice_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_part TEXT;
  v_count INTEGER;
BEGIN
  v_date_part := to_char(now(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.guest_invoices
  WHERE tenant_id = p_tenant_id
    AND invoice_number LIKE 'HD-' || v_date_part || '-%';
  RETURN 'HD-' || v_date_part || '-' || lpad(v_count::text, 4, '0');
END;
$$;
