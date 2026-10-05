
-- Create enum for service categories
CREATE TYPE public.service_category AS ENUM ('wellness', 'transport', 'food_beverage', 'laundry_extra', 'other');

-- Hotel services master table
CREATE TABLE public.hotel_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_en text,
  category service_category NOT NULL DEFAULT 'other',
  description text,
  unit text NOT NULL DEFAULT 'lần',
  price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  icon text DEFAULT '🔧',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Booking service charges (transactional)
CREATE TABLE public.booking_service_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.room_bookings(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.hotel_services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hotel_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_service_charges ENABLE ROW LEVEL SECURITY;

-- RLS policies for hotel_services
CREATE POLICY "hotel_services_select" ON public.hotel_services
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "hotel_services_insert" ON public.hotel_services
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "hotel_services_update" ON public.hotel_services
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "hotel_services_delete" ON public.hotel_services
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- RLS policies for booking_service_charges
CREATE POLICY "booking_service_charges_select" ON public.booking_service_charges
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "booking_service_charges_insert" ON public.booking_service_charges
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "booking_service_charges_update" ON public.booking_service_charges
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "booking_service_charges_delete" ON public.booking_service_charges
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Indexes
CREATE INDEX idx_hotel_services_tenant_hotel ON public.hotel_services(tenant_id, hotel_id);
CREATE INDEX idx_booking_service_charges_booking ON public.booking_service_charges(booking_id);
CREATE INDEX idx_booking_service_charges_tenant ON public.booking_service_charges(tenant_id);
