-- Add item_type enum
CREATE TYPE public.item_type AS ENUM ('linen', 'consumable', 'equipment', 'furniture');

-- Add item_type column to items table
ALTER TABLE public.items 
ADD COLUMN item_type public.item_type NOT NULL DEFAULT 'equipment';

-- Add comment for documentation
COMMENT ON COLUMN public.items.item_type IS 'Type of item: linen (đồ vải), consumable (tiêu hao), equipment (thiết bị), furniture (nội thất)';