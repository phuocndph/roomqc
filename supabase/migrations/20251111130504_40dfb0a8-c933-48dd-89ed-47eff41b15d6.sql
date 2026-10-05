-- =====================================================
-- FIX: Remove problematic index and migrate to item_images table
-- =====================================================

-- Step 1: Drop any existing indexes on items.images column
DROP INDEX IF EXISTS idx_items_images;
DROP INDEX IF EXISTS idx_items_images_gin;
DROP INDEX IF EXISTS items_images_idx;

-- Step 2: Create item_images table
CREATE TABLE IF NOT EXISTS item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  url TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/webp',
  
  is_primary BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- Step 3: Create indexes (smaller, won't exceed limit)
CREATE INDEX IF NOT EXISTS idx_item_images_item_id ON item_images(item_id);
CREATE INDEX IF NOT EXISTS idx_item_images_tenant_id ON item_images(tenant_id);
CREATE INDEX IF NOT EXISTS idx_item_images_primary ON item_images(item_id, is_primary) WHERE is_primary = true;

-- Step 4: Create unique constraint for primary images (only one primary per item)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_per_item 
  ON item_images(item_id) 
  WHERE is_primary = true;

-- Step 5: Enable RLS
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies
CREATE POLICY "Users can view item images in their tenant"
ON item_images FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert item images in their tenant"
ON item_images FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update item images in their tenant"
ON item_images FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete item images in their tenant"
ON item_images FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  )
);

-- Step 7: Create trigger function for primary image handling
CREATE OR REPLACE FUNCTION handle_item_image_primary()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE item_images
    SET is_primary = false
    WHERE item_id = NEW.item_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_item_image_primary ON item_images;
CREATE TRIGGER trg_item_image_primary
  BEFORE INSERT OR UPDATE ON item_images
  FOR EACH ROW
  EXECUTE FUNCTION handle_item_image_primary();

-- Step 8: Migrate existing data from items.images to item_images
-- Note: items.images is TEXT[] not JSONB
DO $$
DECLARE
  v_item RECORD;
  v_image TEXT;
  v_order INTEGER;
BEGIN
  FOR v_item IN 
    SELECT id, tenant_id, images
    FROM items
    WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0
  LOOP
    v_order := 0;
    
    FOREACH v_image IN ARRAY v_item.images
    LOOP
      INSERT INTO item_images (
        item_id,
        tenant_id,
        url,
        is_primary,
        display_order
      ) VALUES (
        v_item.id,
        v_item.tenant_id,
        v_image,
        v_order = 0,
        v_order
      )
      ON CONFLICT DO NOTHING;
      
      v_order := v_order + 1;
    END LOOP;
  END LOOP;
END $$;