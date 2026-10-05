-- Fix RPCs to support draft batches (vendor_id can be NULL)

-- 1. Fix get_laundry_batch_detail - use LEFT JOIN for vendor
CREATE OR REPLACE FUNCTION public.get_laundry_batch_detail(p_batch_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'batch', to_jsonb(lb),
    'vendor', CASE WHEN lv.id IS NOT NULL THEN to_jsonb(lv) ELSE NULL END,
    'hotel', to_jsonb(h),
    'delivery_staff', CASE WHEN ds.id IS NOT NULL THEN jsonb_build_object(
      'id', ds.id,
      'full_name', ds.full_name,
      'avatar_url', ds.avatar_url
    ) ELSE NULL END,
    'return_staff', CASE WHEN rs.id IS NOT NULL THEN jsonb_build_object(
      'id', rs.id,
      'full_name', rs.full_name,
      'avatar_url', rs.avatar_url
    ) ELSE NULL END,
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', lbi.id,
          'batch_id', lbi.batch_id,
          'item_id', lbi.item_id,
          'quantity_delivered', lbi.quantity_delivered,
          'weight_kg', lbi.weight_kg,
          'condition_note', lbi.condition_note,
          'quantity_returned', lbi.quantity_returned,
          'quantity_lost', lbi.quantity_lost,
          'quantity_damaged', lbi.quantity_damaged,
          'return_condition', lbi.return_condition,
          'item_code', i.code,
          'item_name', i.name,
          'item_thumbnail', i.thumbnail_url,
          'item_unit', i.unit,
          'category_name', c.name
        )
      )
      FROM laundry_batch_items lbi
      JOIN items i ON i.id = lbi.item_id
      LEFT JOIN categories c ON c.id = i.category_id
      WHERE lbi.batch_id = lb.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM laundry_batches lb
  LEFT JOIN laundry_vendors lv ON lv.id = lb.vendor_id  -- Changed from JOIN to LEFT JOIN
  JOIN hotels h ON h.id = lb.hotel_id
  LEFT JOIN users ds ON ds.id = lb.delivery_staff_id
  LEFT JOIN users rs ON rs.id = lb.return_staff_id
  WHERE lb.id = p_batch_id;
  
  RETURN v_result;
END;
$$;

-- 2. Fix get_laundry_batches_filtered - use LEFT JOIN for vendor
CREATE OR REPLACE FUNCTION public.get_laundry_batches_filtered(
  p_tenant_id UUID,
  p_hotel_id UUID DEFAULT NULL,
  p_vendor_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  hotel_id UUID,
  vendor_id UUID,
  batch_code TEXT,
  status TEXT,
  delivery_date TIMESTAMPTZ,
  expected_return_date TIMESTAMPTZ,
  actual_return_date TIMESTAMPTZ,
  total_items INTEGER,
  total_weight_kg NUMERIC,
  estimated_cost NUMERIC,
  actual_cost NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  vendor_name TEXT,
  vendor_logo TEXT,
  vendor_rating NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  
  -- Get total count first
  SELECT COUNT(*) INTO v_total
  FROM laundry_batches lb
  LEFT JOIN laundry_vendors lv ON lv.id = lb.vendor_id  -- Changed from JOIN to LEFT JOIN
  WHERE lb.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
    AND (p_vendor_id IS NULL OR lb.vendor_id = p_vendor_id)
    AND (p_status IS NULL OR lb.status = p_status)
    AND (p_from_date IS NULL OR lb.delivery_date::date >= p_from_date OR lb.delivery_date IS NULL)
    AND (p_to_date IS NULL OR lb.delivery_date::date <= p_to_date OR lb.delivery_date IS NULL)
    AND (
      p_search IS NULL 
      OR lb.batch_code ILIKE '%' || p_search || '%'
      OR lv.name ILIKE '%' || p_search || '%'
    );
  
  RETURN QUERY
  SELECT 
    lb.id,
    lb.tenant_id,
    lb.hotel_id,
    lb.vendor_id,
    lb.batch_code,
    lb.status,
    lb.delivery_date,
    lb.expected_return_date,
    lb.actual_return_date,
    lb.total_items,
    lb.total_weight_kg,
    lb.estimated_cost,
    lb.actual_cost,
    lb.notes,
    lb.created_at,
    lb.updated_at,
    COALESCE(lv.name, 'Chưa chọn vendor') as vendor_name,  -- Handle NULL vendor
    lv.logo_url as vendor_logo,
    COALESCE(lv.rating, 0) as vendor_rating,
    v_total as total_count
  FROM laundry_batches lb
  LEFT JOIN laundry_vendors lv ON lv.id = lb.vendor_id  -- Changed from JOIN to LEFT JOIN
  WHERE lb.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR lb.hotel_id = p_hotel_id)
    AND (p_vendor_id IS NULL OR lb.vendor_id = p_vendor_id)
    AND (p_status IS NULL OR lb.status = p_status)
    AND (p_from_date IS NULL OR lb.delivery_date::date >= p_from_date OR lb.delivery_date IS NULL)
    AND (p_to_date IS NULL OR lb.delivery_date::date <= p_to_date OR lb.delivery_date IS NULL)
    AND (
      p_search IS NULL 
      OR lb.batch_code ILIKE '%' || p_search || '%'
      OR lv.name ILIKE '%' || p_search || '%'
    )
  ORDER BY 
    CASE WHEN lb.status = 'draft' THEN 0 ELSE 1 END,  -- Draft batches first
    lb.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;