-- ============================================
-- COMPREHENSIVE ITEM TYPE CLASSIFICATION FIX
-- ============================================

-- PART 1: Add default_item_type column to item_categories
ALTER TABLE item_categories 
ADD COLUMN IF NOT EXISTS default_item_type TEXT 
CHECK (default_item_type IN ('linen', 'consumable', 'equipment', 'furniture'));

COMMENT ON COLUMN item_categories.default_item_type IS 'Default item type for items in this category - linen, consumable, equipment, furniture';

-- PART 2: Update existing categories with appropriate default_item_type based on name/keywords
UPDATE item_categories 
SET default_item_type = CASE
  -- Linen categories
  WHEN LOWER(name) ILIKE ANY(ARRAY['%vải%', '%linen%', '%khăn%', '%ga%', '%gối%', '%chăn%', '%màn%', '%rèm%', '%bedding%', '%textile%']) THEN 'linen'
  -- Consumable categories
  WHEN LOWER(name) ILIKE ANY(ARRAY['%tiêu hao%', '%vệ sinh%', '%phòng tắm%', '%ẩm thực%', '%minibar%', '%toiletries%', '%bathroom%', '%consumable%', '%dùng 1 lần%', '%amenities%']) THEN 'consumable'
  -- Furniture categories
  WHEN LOWER(name) ILIKE ANY(ARRAY['%nội thất%', '%furniture%', '%bàn%', '%ghế%', '%tủ%', '%giường%', '%sofa%']) THEN 'furniture'
  -- Equipment categories (default for electronics, devices, etc.)
  WHEN LOWER(name) ILIKE ANY(ARRAY['%điện%', '%thiết bị%', '%electronic%', '%equipment%', '%device%', '%máy%']) THEN 'equipment'
  -- Default to equipment if no match
  ELSE 'equipment'
END
WHERE default_item_type IS NULL;

-- PART 3: Create trigger function to auto-classify item_type
CREATE OR REPLACE FUNCTION public.auto_classify_item_type()
RETURNS TRIGGER AS $$
DECLARE
  v_default_type TEXT;
BEGIN
  -- If user explicitly changed item_type, respect that choice
  IF TG_OP = 'UPDATE' AND OLD.item_type IS NOT NULL AND NEW.item_type IS NOT NULL AND NEW.item_type::TEXT != OLD.item_type::TEXT THEN
    RETURN NEW;
  END IF;

  -- Get default_item_type from category if available
  IF NEW.category_id IS NOT NULL THEN
    SELECT default_item_type INTO v_default_type
    FROM item_categories 
    WHERE id = NEW.category_id;
  END IF;
  
  -- If category has default_item_type, use it
  IF v_default_type IS NOT NULL THEN
    NEW.item_type := v_default_type::item_type;
    RETURN NEW;
  END IF;
  
  -- Fallback: classify based on item name keywords (only if item_type is NULL)
  IF NEW.item_type IS NULL THEN
    NEW.item_type := (CASE
      -- Linen keywords
      WHEN NEW.name ILIKE ANY(ARRAY['%khăn%', '%ga%', '%gối%', '%chăn%', '%màn%', '%rèm%', '%towel%', '%sheet%', '%pillow%', '%blanket%']) THEN 'linen'
      -- Consumable keywords
      WHEN NEW.name ILIKE ANY(ARRAY['%dầu gội%', '%sữa tắm%', '%kem%', '%bàn chải%', '%xà phòng%', '%nước%', '%giấy%', '%soap%', '%shampoo%', '%tissue%', '%bột giặt%', '%nước rửa%']) THEN 'consumable'
      -- Furniture keywords
      WHEN NEW.name ILIKE ANY(ARRAY['%bàn %', '%ghế %', '%tủ %', '%giường%', '%sofa%', '%kệ %', '%table%', '%chair%', '%cabinet%', '%bed%', '%desk%']) THEN 'furniture'
      -- Default to equipment
      ELSE 'equipment'
    END)::item_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_classify_item_type ON items;

CREATE TRIGGER trigger_auto_classify_item_type
  BEFORE INSERT ON items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_classify_item_type();

-- PART 4: Fix existing items that are misclassified
-- Update items to match their category's default_item_type
UPDATE items i
SET item_type = ic.default_item_type::item_type,
    updated_at = NOW()
FROM item_categories ic
WHERE i.category_id = ic.id
  AND ic.default_item_type IS NOT NULL
  AND i.item_type::TEXT != ic.default_item_type;

-- PART 5: Fix items that still have wrong type based on name keywords (fallback fix)
-- Fix linen items
UPDATE items
SET item_type = 'linen'::item_type, updated_at = NOW()
WHERE item_type::TEXT != 'linen'
  AND name ILIKE ANY(ARRAY['%khăn%', '%ga giường%', '%gối%', '%chăn%', '%màn%', '%rèm%', '%towel%', '%sheet%', '%pillow%']);

-- Fix consumable items
UPDATE items
SET item_type = 'consumable'::item_type, updated_at = NOW()
WHERE item_type::TEXT != 'consumable'
  AND name ILIKE ANY(ARRAY['%dầu gội%', '%sữa tắm%', '%kem đánh răng%', '%bàn chải%', '%xà phòng%', '%giấy vệ sinh%', '%bột giặt%', '%nước rửa%', '%shampoo%', '%soap%']);

-- Fix furniture items
UPDATE items
SET item_type = 'furniture'::item_type, updated_at = NOW()
WHERE item_type::TEXT != 'furniture'
  AND name ILIKE ANY(ARRAY['%bàn làm việc%', '%ghế %', '%tủ %', '%giường%', '%sofa%', '%kệ %', '%table%', '%chair%', '%cabinet%']);

-- Fix equipment items (electronics that were wrongly classified)
UPDATE items
SET item_type = 'equipment'::item_type, updated_at = NOW()
WHERE item_type::TEXT NOT IN ('equipment')
  AND name ILIKE ANY(ARRAY['%ấm đun%', '%máy sấy%', '%tivi%', '%điều hòa%', '%remote%', '%điều khiển%', '%điện thoại%', '%đèn%', '%kettle%', '%tv%', '%phone%', '%lamp%', '%đồng hồ%', '%tủ lạnh%', '%máy pha%']);