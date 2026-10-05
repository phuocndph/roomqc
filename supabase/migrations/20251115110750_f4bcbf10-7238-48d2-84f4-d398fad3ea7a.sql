-- Fix get_stock_adjustments_filtered function
-- Drop and recreate with missing created_at and updated_at columns

DROP FUNCTION IF EXISTS public.get_stock_adjustments_filtered(uuid, uuid, text, text, uuid, date, date, integer, integer);

CREATE OR REPLACE FUNCTION public.get_stock_adjustments_filtered(
  p_tenant_id uuid, 
  p_hotel_id uuid DEFAULT NULL::uuid, 
  p_status text DEFAULT NULL::text, 
  p_adjustment_type text DEFAULT NULL::text, 
  p_created_by uuid DEFAULT NULL::uuid, 
  p_date_from date DEFAULT NULL::date, 
  p_date_to date DEFAULT NULL::date, 
  p_limit integer DEFAULT 25, 
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, 
  adjustment_code text, 
  adjustment_type text, 
  status text, 
  scheduled_date date, 
  started_at timestamp with time zone, 
  completed_at timestamp with time zone, 
  created_by uuid, 
  created_by_name text, 
  assigned_to uuid[], 
  assigned_to_names text[], 
  total_items_checked integer, 
  total_discrepancies integer, 
  total_value_difference numeric, 
  approved_by uuid, 
  approved_by_name text, 
  notes text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
begin
  return query
  with filtered_adjustments as (
    select 
      sa.id,
      sa.adjustment_code,
      sa.adjustment_type,
      sa.status,
      sa.scheduled_date,
      sa.started_at,
      sa.completed_at,
      sa.created_by,
      cu.full_name as created_by_name,
      sa.assigned_to,
      array(
        select u.full_name 
        from users u 
        where u.id = any(sa.assigned_to)
      ) as assigned_to_names,
      sa.total_items_checked,
      sa.total_discrepancies,
      sa.total_value_difference,
      sa.approved_by,
      au.full_name as approved_by_name,
      sa.notes,
      sa.created_at,
      sa.updated_at
    from stock_adjustments sa
    left join users cu on cu.id = sa.created_by
    left join users au on au.id = sa.approved_by
    where sa.tenant_id = p_tenant_id
      and (p_hotel_id is null or sa.hotel_id = p_hotel_id)
      and (p_status is null or sa.status = p_status)
      and (p_adjustment_type is null or sa.adjustment_type = p_adjustment_type)
      and (p_created_by is null or sa.created_by = p_created_by)
      and (p_date_from is null or sa.scheduled_date >= p_date_from)
      and (p_date_to is null or sa.scheduled_date <= p_date_to)
  )
  select 
    fa.*,
    count(*) over() as total_count
  from filtered_adjustments fa
  order by fa.scheduled_date desc, fa.created_at desc
  limit p_limit
  offset p_offset;
end;
$function$;