-- Drop existing function first
DROP FUNCTION IF EXISTS public.get_items_filtered(uuid,uuid,uuid,text,text,text,integer,integer);

-- Step 1: Recreate get_items_filtered with JOIN that checks hotel_id match
CREATE OR REPLACE FUNCTION public.get_items_filtered(
  p_tenant_id uuid,
  p_hotel_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_stock_status text DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  code text,
  name text,
  name_en text,
  category_id uuid,
  category_name text,
  category_color text,
  hotel_id uuid,
  unit text,
  unit_price numeric,
  brand text,
  model text,
  quantity_total integer,
  quantity_in_stock integer,
  quantity_in_use integer,
  quantity_in_laundry integer,
  quantity_damaged integer,
  quantity_lost integer,
  minimum_stock integer,
  reorder_point integer,
  status text,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  stock_status text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM items i
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND (p_category_id IS NULL OR i.category_id = p_category_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR 
         i.name ILIKE '%' || p_search || '%' OR 
         i.code ILIKE '%' || p_search || '%' OR
         i.brand ILIKE '%' || p_search || '%')
    AND (p_stock_status IS NULL OR
         CASE 
           WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
           WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
           ELSE 'in_stock'
         END = p_stock_status);

  RETURN QUERY
  SELECT 
    i.id,
    i.code,
    i.name,
    i.name_en,
    i.category_id,
    c.name as category_name,
    c.color as category_color,
    i.hotel_id,
    i.unit,
    i.unit_price,
    i.brand,
    i.model,
    i.quantity_total,
    i.quantity_in_stock,
    i.quantity_in_use,
    i.quantity_in_laundry,
    i.quantity_damaged,
    i.quantity_lost,
    i.minimum_stock,
    i.reorder_point,
    i.status,
    i.description,
    i.created_at,
    i.updated_at,
    CASE 
      WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
      WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
      ELSE 'in_stock'
    END as stock_status,
    v_total as total_count
  FROM items i
  LEFT JOIN item_categories c ON c.id = i.category_id 
    AND c.tenant_id = i.tenant_id 
    AND c.hotel_id = i.hotel_id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND (p_category_id IS NULL OR i.category_id = p_category_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_search IS NULL OR p_search = '' OR 
         i.name ILIKE '%' || p_search || '%' OR 
         i.code ILIKE '%' || p_search || '%' OR
         i.brand ILIKE '%' || p_search || '%')
    AND (p_stock_status IS NULL OR
         CASE 
           WHEN COALESCE(i.quantity_in_stock, 0) <= 0 THEN 'out_of_stock'
           WHEN COALESCE(i.quantity_in_stock, 0) <= COALESCE(i.minimum_stock, 0) THEN 'low_stock'
           ELSE 'in_stock'
         END = p_stock_status)
  ORDER BY i.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Step 2: Create validation function for category-hotel relationship
CREATE OR REPLACE FUNCTION public.validate_item_category_hotel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_hotel_id uuid;
  v_category_tenant_id uuid;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT hotel_id, tenant_id 
    INTO v_category_hotel_id, v_category_tenant_id
    FROM item_categories 
    WHERE id = NEW.category_id;
    
    IF v_category_hotel_id IS NULL AND v_category_tenant_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    IF v_category_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'Category tenant_id does not match item tenant_id';
    END IF;
    
    IF v_category_hotel_id IS NOT NULL AND v_category_hotel_id IS DISTINCT FROM NEW.hotel_id THEN
      RAISE EXCEPTION 'Category hotel_id does not match item hotel_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 3: Create trigger on items table
DROP TRIGGER IF EXISTS tr_validate_item_category_hotel ON items;
CREATE TRIGGER tr_validate_item_category_hotel
  BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION validate_item_category_hotel();

-- Step 4: Create RPC function to sync categories from items (repair data)
CREATE OR REPLACE FUNCTION public.sync_categories_for_hotel(
  p_tenant_id uuid,
  p_hotel_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categories_created integer := 0;
  v_items_fixed integer := 0;
  r RECORD;
BEGIN
  FOR r IN 
    SELECT DISTINCT 
      c.name as category_name,
      c.icon,
      c.color,
      c.description,
      c.code as category_code
    FROM items i
    JOIN item_categories c ON c.id = i.category_id
    WHERE i.tenant_id = p_tenant_id 
      AND i.hotel_id = p_hotel_id
      AND (c.hotel_id IS NULL OR c.hotel_id != p_hotel_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM item_categories 
      WHERE tenant_id = p_tenant_id 
        AND hotel_id = p_hotel_id 
        AND name = r.category_name
    ) THEN
      INSERT INTO item_categories (tenant_id, hotel_id, name, icon, color, description, code, status)
      VALUES (
        p_tenant_id, 
        p_hotel_id, 
        r.category_name, 
        r.icon, 
        r.color, 
        r.description,
        r.category_code || '_' || substring(p_hotel_id::text, 1, 4),
        'active'
      );
      v_categories_created := v_categories_created + 1;
    END IF;
  END LOOP;

  UPDATE items i
  SET category_id = (
    SELECT id FROM item_categories 
    WHERE tenant_id = p_tenant_id 
      AND hotel_id = p_hotel_id 
      AND name = (SELECT name FROM item_categories WHERE id = i.category_id)
    LIMIT 1
  )
  WHERE i.tenant_id = p_tenant_id 
    AND i.hotel_id = p_hotel_id
    AND i.category_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM item_categories c 
      WHERE c.id = i.category_id 
        AND (c.hotel_id IS NULL OR c.hotel_id != p_hotel_id)
    );
  
  GET DIAGNOSTICS v_items_fixed = ROW_COUNT;

  RETURN jsonb_build_object(
    'categories_created', v_categories_created,
    'items_fixed', v_items_fixed
  );
END;
$$;