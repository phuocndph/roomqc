-- Create booking_consumables table to track consumable usage per booking
CREATE TABLE public.booking_consumables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.room_bookings(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  initial_quantity INTEGER NOT NULL DEFAULT 0,
  supplemented_quantity INTEGER NOT NULL DEFAULT 0,
  remaining_quantity INTEGER DEFAULT NULL,
  consumed_quantity INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN remaining_quantity IS NOT NULL 
      THEN GREATEST(0, initial_quantity + supplemented_quantity - remaining_quantity)
      ELSE NULL 
    END
  ) STORED,
  unit_price NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(booking_id, item_id)
);

-- Add booking_id to distribution_order_rooms for linking replenishments to bookings
ALTER TABLE public.distribution_order_rooms 
ADD COLUMN booking_id UUID REFERENCES public.room_bookings(id) ON DELETE SET NULL;

-- Enable RLS on booking_consumables
ALTER TABLE public.booking_consumables ENABLE ROW LEVEL SECURITY;

-- RLS Policies for booking_consumables
CREATE POLICY "Users can view booking consumables from their tenant"
ON public.booking_consumables
FOR SELECT
USING (tenant_id IN (
  SELECT users.tenant_id FROM users WHERE users.id = auth.uid()
));

CREATE POLICY "Users can insert booking consumables in their tenant"
ON public.booking_consumables
FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT users.tenant_id FROM users WHERE users.id = auth.uid()
));

CREATE POLICY "Users can update booking consumables in their tenant"
ON public.booking_consumables
FOR UPDATE
USING (tenant_id IN (
  SELECT users.tenant_id FROM users WHERE users.id = auth.uid()
));

CREATE POLICY "Users can delete booking consumables in their tenant"
ON public.booking_consumables
FOR DELETE
USING (tenant_id IN (
  SELECT users.tenant_id FROM users WHERE users.id = auth.uid()
));

-- Create index for faster queries
CREATE INDEX idx_booking_consumables_booking_id ON public.booking_consumables(booking_id);
CREATE INDEX idx_booking_consumables_room_id ON public.booking_consumables(room_id);
CREATE INDEX idx_distribution_order_rooms_booking_id ON public.distribution_order_rooms(booking_id);

-- Trigger to update updated_at
CREATE TRIGGER update_booking_consumables_updated_at
BEFORE UPDATE ON public.booking_consumables
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();