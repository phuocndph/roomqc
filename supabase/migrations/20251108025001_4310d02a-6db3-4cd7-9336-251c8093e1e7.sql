-- ============================================
-- PART 5: STOCK ADJUSTMENTS & CRITICAL TRIGGERS
-- ============================================

-- Stock adjustments table
create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  adjustment_code text unique not null,
  adjustment_type text not null,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  status text default 'draft',
  created_by uuid not null references users(id),
  assigned_to uuid[] default '{}',
  approved_by uuid references users(id),
  total_items_checked integer default 0,
  total_discrepancies integer default 0,
  total_value_difference decimal(15,2) default 0,
  notes text,
  approval_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint stock_adjustments_type_check check (adjustment_type in ('inventory_check', 'damage', 'loss', 'correction', 'other')),
  constraint stock_adjustments_status_check check (status in ('draft', 'in_progress', 'completed', 'approved', 'rejected'))
);

create index idx_stock_adjustments_tenant on stock_adjustments(tenant_id);
create trigger stock_adjustments_updated_at before update on stock_adjustments for each row execute function update_updated_at_column();

create or replace function stock_adjustments_generate_code() returns trigger as $$
begin
  if new.adjustment_code is null or new.adjustment_code = '' then
    new.adjustment_code := 'ADJ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9999)::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger stock_adjustments_before_insert before insert on stock_adjustments for each row execute function stock_adjustments_generate_code();

-- Stock adjustment items
create table stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references stock_adjustments(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  system_quantity integer not null,
  actual_quantity integer not null,
  difference integer generated always as (actual_quantity - system_quantity) stored,
  unit_price decimal(15,2),
  value_difference decimal(15,2) generated always as ((actual_quantity - system_quantity) * unit_price) stored,
  discrepancy_reason text,
  status text default 'pending',
  checked_by uuid references users(id),
  checked_at timestamptz,
  photos text[] default '{}',
  notes text,
  created_at timestamptz default now(),
  constraint stock_adjustment_items_status_check check (status in ('pending', 'approved', 'rejected'))
);

create index idx_stock_adjustment_items_adjustment on stock_adjustment_items(adjustment_id);
create index idx_stock_adjustment_items_item on stock_adjustment_items(item_id);

-- CRITICAL TRIGGER: Laundry batch items inventory sync
create or replace function laundry_batch_items_update_inventory() returns trigger as $$
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
        quantity_damaged = quantity_damaged + (new.quantity_damaged - old.quantity_damaged)
      where id = new.item_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger laundry_batch_items_inventory_trigger
  after insert or update on laundry_batch_items
  for each row execute function laundry_batch_items_update_inventory();

-- TRIGGER: Update vendor stats when batch completed
create or replace function update_vendor_stats() returns trigger as $$
begin
  if new.status = 'received' and (old.status is null or old.status != 'received') then
    update laundry_vendors set
      total_orders = total_orders + 1,
      total_value = total_value + coalesce(new.actual_cost, new.estimated_cost, 0)
    where id = new.vendor_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger laundry_batches_update_vendor_stats
  after update on laundry_batches
  for each row execute function update_vendor_stats();

-- TRIGGER: Update PO totals when items change
create or replace function update_purchase_order_totals() returns trigger as $$
begin
  update purchase_orders set
    subtotal = (select coalesce(sum(total_price), 0) from purchase_order_items where po_id = coalesce(new.po_id, old.po_id)),
    total_amount = subtotal + tax_amount + shipping_fee
  where id = coalesce(new.po_id, old.po_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger purchase_order_items_update_totals
  after insert or update or delete on purchase_order_items
  for each row execute function update_purchase_order_totals();

-- TRIGGER: Auto update inventory when PO items received
create or replace function purchase_order_items_receive() returns trigger as $$
declare
  received_diff integer;
  po_record record;
begin
  if new.quantity_received > old.quantity_received then
    received_diff := new.quantity_received - old.quantity_received;
    select * into po_record from purchase_orders where id = new.po_id;
    
    update items set
      quantity_in_stock = quantity_in_stock + received_diff,
      quantity_total = quantity_total + received_diff
    where id = new.item_id;
    
    insert into inventory_transactions (
      tenant_id, hotel_id, item_id, transaction_type, transaction_category,
      quantity, unit_price, total_value, quantity_before, quantity_after,
      created_by, related_type, related_id, notes
    )
    select
      i.tenant_id, i.hotel_id, new.item_id, 'in', 'purchase',
      received_diff, new.unit_price, received_diff * new.unit_price,
      i.quantity_in_stock - received_diff, i.quantity_in_stock,
      po_record.requested_by, 'purchase_order', new.po_id,
      'Nhập hàng từ PO: ' || po_record.po_code
    from items i where i.id = new.item_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger purchase_order_items_receive_trigger
  after update on purchase_order_items
  for each row execute function purchase_order_items_receive();

-- TRIGGER: Update adjustment summary
create or replace function update_adjustment_summary() returns trigger as $$
begin
  update stock_adjustments set
    total_items_checked = (select count(*) from stock_adjustment_items where adjustment_id = coalesce(new.adjustment_id, old.adjustment_id)),
    total_discrepancies = (select count(*) from stock_adjustment_items where adjustment_id = coalesce(new.adjustment_id, old.adjustment_id) and difference != 0),
    total_value_difference = (select coalesce(sum(value_difference), 0) from stock_adjustment_items where adjustment_id = coalesce(new.adjustment_id, old.adjustment_id))
  where id = coalesce(new.adjustment_id, old.adjustment_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger stock_adjustment_items_update_summary
  after insert or update or delete on stock_adjustment_items
  for each row execute function update_adjustment_summary();

-- TRIGGER: Apply stock adjustments when approved
create or replace function stock_adjustment_items_apply() returns trigger as $$
begin
  if new.status = 'approved' and (old.status is null or old.status != 'approved') then
    insert into inventory_transactions (
      tenant_id, hotel_id, item_id, transaction_type, transaction_category,
      quantity, quantity_before, quantity_after, created_by, related_type, related_id, notes
    )
    select
      i.tenant_id, i.hotel_id, new.item_id,
      case when new.difference > 0 then 'in' else 'out' end, 'adjustment',
      abs(new.difference), i.quantity_in_stock, i.quantity_in_stock + new.difference,
      sa.created_by, 'stock_adjustment', new.adjustment_id,
      'Điều chỉnh từ kiểm kê: ' || coalesce(new.discrepancy_reason, '')
    from items i
    join stock_adjustments sa on sa.id = new.adjustment_id
    where i.id = new.item_id;
    
    update items set
      quantity_in_stock = quantity_in_stock + new.difference,
      quantity_total = quantity_total + new.difference
    where id = new.item_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger stock_adjustment_items_apply_trigger
  after update on stock_adjustment_items
  for each row execute function stock_adjustment_items_apply();