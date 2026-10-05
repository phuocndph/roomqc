
-- Add delivered_by column to distribution_order_rooms
ALTER TABLE public.distribution_order_rooms 
ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES public.users(id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_distribution_order_rooms_delivered_by 
ON public.distribution_order_rooms(delivered_by);
