-- Create room_bookings table for guest check-in/check-out tracking
CREATE TABLE public.room_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  
  -- Guest info
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  guest_email TEXT,
  guest_count INTEGER DEFAULT 1,
  
  -- Booking dates
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  actual_check_in TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  
  -- Status: confirmed, checked_in, checked_out, cancelled, no_show
  status TEXT NOT NULL DEFAULT 'confirmed',
  
  -- Notes and extra info
  notes TEXT,
  booking_source TEXT, -- direct, ota, phone, walk_in
  booking_reference TEXT, -- external booking ID if from OTA
  
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX idx_room_bookings_room_id ON public.room_bookings(room_id);
CREATE INDEX idx_room_bookings_hotel_id ON public.room_bookings(hotel_id);
CREATE INDEX idx_room_bookings_status ON public.room_bookings(status);
CREATE INDEX idx_room_bookings_dates ON public.room_bookings(check_in_date, check_out_date);

-- Enable RLS
ALTER TABLE public.room_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view room bookings from their tenant"
ON public.room_bookings
FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Managers can insert room bookings"
ON public.room_bookings
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner'::app_role) OR 
    has_role(auth.uid(), 'hotel_manager'::app_role) OR 
    has_role(auth.uid(), 'department_manager'::app_role)
  )
);

CREATE POLICY "Managers can update room bookings"
ON public.room_bookings
FOR UPDATE
USING (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner'::app_role) OR 
    has_role(auth.uid(), 'hotel_manager'::app_role) OR 
    has_role(auth.uid(), 'department_manager'::app_role)
  )
);

CREATE POLICY "Managers can delete room bookings"
ON public.room_bookings
FOR DELETE
USING (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner'::app_role) OR 
    has_role(auth.uid(), 'hotel_manager'::app_role)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_room_bookings_updated_at
BEFORE UPDATE ON public.room_bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get current active booking for a room
CREATE OR REPLACE FUNCTION public.get_current_room_booking(p_room_id UUID)
RETURNS TABLE (
  id UUID,
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  guest_count INTEGER,
  check_in_date DATE,
  check_out_date DATE,
  actual_check_in TIMESTAMPTZ,
  status TEXT,
  notes TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    rb.id,
    rb.guest_name,
    rb.guest_phone,
    rb.guest_email,
    rb.guest_count,
    rb.check_in_date,
    rb.check_out_date,
    rb.actual_check_in,
    rb.status,
    rb.notes
  FROM room_bookings rb
  WHERE rb.room_id = p_room_id
    AND rb.status IN ('confirmed', 'checked_in')
    AND rb.check_out_date >= CURRENT_DATE
  ORDER BY rb.check_in_date ASC
  LIMIT 1;
$$;