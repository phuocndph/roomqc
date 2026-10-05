-- Vá: laundry_batch_items_update_inventory chạy SECURITY DEFINER
-- Lý do: trigger update bảng items khi insert/update laundry_batch_items.
-- Khi flow chạy dưới Edge Function / staff role không có UPDATE quyền trên items
-- (RLS chỉ cho owner/hotel_manager/department_manager update), trigger sẽ fail.
-- Chuyển sang SECURITY DEFINER để là single source of truth cho stock deduction
-- bất kể caller role, đảm bảo Linen Pool Bridge không bị lệch.

CREATE OR REPLACE FUNCTION public.laundry_batch_items_update_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if (TG_OP = 'INSERT') then
    update items set
      quantity_in_laundry = quantity_in_laundry + new.quantity_delivered,
      quantity_in_stock = quantity_in_stock - new.quantity_delivered,
      current_wash_cycles = current_wash_cycles + 1
    where id = new.item_id;
  elsif (TG_OP = 'UPDATE') then
    if new.quantity_returned > old.quantity_returned then
      update items set
        quantity_in_laundry = quantity_in_laundry - (new.quantity_returned - old.quantity_returned),
        quantity_in_stock = quantity_in_stock + (new.quantity_returned - old.quantity_returned)
      where id = new.item_id;
    end if;
    if new.quantity_lost > old.quantity_lost then
      update items set
        quantity_in_laundry = quantity_in_laundry - (new.quantity_lost - old.quantity_lost),
        quantity_lost = quantity_lost + (new.quantity_lost - old.quantity_lost),
        quantity_total = quantity_total - (new.quantity_lost - old.quantity_lost)
      where id = new.item_id;
    end if;
    if new.quantity_damaged > old.quantity_damaged then
      update items set
        quantity_in_laundry = quantity_in_laundry - (new.quantity_damaged - old.quantity_damaged),
        quantity_damaged = quantity_damaged + (new.quantity_damaged - old.quantity_damaged),
        quantity_total = quantity_total - (new.quantity_damaged - old.quantity_damaged)
      where id = new.item_id;
    end if;
  end if;
  return new;
end;
$function$;