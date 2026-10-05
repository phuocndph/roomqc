
-- Fix the room_items_update_inventory trigger to handle insufficient stock
-- When assigning items to rooms, if there's not enough stock, increase the total quantity
CREATE OR REPLACE FUNCTION public.room_items_update_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
  v_current_stock integer;
  v_needed integer;
  v_shortage integer;
begin
  if (TG_OP = 'INSERT') then
    -- Check current stock
    select quantity_in_stock into v_current_stock from items where id = new.item_id;
    v_needed := new.quantity;
    
    if v_current_stock >= v_needed then
      -- Enough stock: move from stock to in_use
      update items 
      set quantity_in_use = quantity_in_use + v_needed,
          quantity_in_stock = quantity_in_stock - v_needed
      where id = new.item_id;
    else
      -- Not enough stock: increase total and in_use, deplete stock
      v_shortage := v_needed - v_current_stock;
      update items 
      set quantity_total = quantity_total + v_shortage,
          quantity_in_use = quantity_in_use + v_needed,
          quantity_in_stock = 0
      where id = new.item_id;
    end if;
    
  elsif (TG_OP = 'UPDATE') then
    -- Calculate the difference
    v_needed := new.quantity - old.quantity;
    
    if v_needed > 0 then
      -- Increasing quantity: check stock availability
      select quantity_in_stock into v_current_stock from items where id = new.item_id;
      
      if v_current_stock >= v_needed then
        -- Enough stock: move from stock to in_use
        update items 
        set quantity_in_use = quantity_in_use + v_needed,
            quantity_in_stock = quantity_in_stock - v_needed
        where id = new.item_id;
      else
        -- Not enough stock: increase total and in_use, deplete stock
        v_shortage := v_needed - v_current_stock;
        update items 
        set quantity_total = quantity_total + v_shortage,
            quantity_in_use = quantity_in_use + v_needed,
            quantity_in_stock = quantity_in_stock - v_current_stock
        where id = new.item_id;
      end if;
    elsif v_needed < 0 then
      -- Decreasing quantity: return to stock
      update items 
      set quantity_in_use = quantity_in_use + v_needed,
          quantity_in_stock = quantity_in_stock - v_needed
      where id = new.item_id;
    end if;
    
  elsif (TG_OP = 'DELETE') then
    -- Return items to stock
    update items 
    set quantity_in_use = quantity_in_use - old.quantity,
        quantity_in_stock = quantity_in_stock + old.quantity
    where id = old.item_id;
    return old;
  end if;
  
  return new;
end;
$function$;
