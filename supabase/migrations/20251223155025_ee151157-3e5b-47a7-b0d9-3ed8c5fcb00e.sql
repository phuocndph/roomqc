-- Allow room_items.quantity to be 0 (missing items)
ALTER TABLE public.room_items
DROP CONSTRAINT IF EXISTS room_items_quantity_positive;

ALTER TABLE public.room_items
ADD CONSTRAINT room_items_quantity_nonnegative
CHECK (quantity >= 0);