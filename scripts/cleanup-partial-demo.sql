BEGIN;

-- This cleanup is deliberately scoped to the local demo tenant and the rows
-- created by the interrupted ROOMQC seed run on 2026-09-21.
CREATE TEMP TABLE _demo_items ON COMMIT DROP AS
SELECT id
FROM public.items
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND hotel_id = 'f6dadbdb-67a8-4c57-8cc2-44625fd029fb'
  AND code LIKE 'ROOMQC-DEMO-ITEM-%';

CREATE TEMP TABLE _demo_rooms ON COMMIT DROP AS
SELECT id
FROM public.rooms
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND hotel_id = 'f6dadbdb-67a8-4c57-8cc2-44625fd029fb'
  AND created_at >= '2026-09-21 01:54:18+00';

CREATE TEMP TABLE _demo_batches ON COMMIT DROP AS
SELECT id
FROM public.laundry_batches
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND hotel_id = 'f6dadbdb-67a8-4c57-8cc2-44625fd029fb'
  AND (batch_code LIKE 'ROOMQC-DEMO-%' OR notes LIKE 'ROOMQC-DEMO-%');

CREATE TEMP TABLE _demo_pos ON COMMIT DROP AS
SELECT id
FROM public.purchase_orders
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND hotel_id = 'f6dadbdb-67a8-4c57-8cc2-44625fd029fb'
  AND (po_code LIKE 'ROOMQC-DEMO-%' OR notes LIKE 'ROOMQC-DEMO-%');

CREATE TEMP TABLE _demo_adjustments ON COMMIT DROP AS
SELECT id
FROM public.stock_adjustments
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND hotel_id = 'f6dadbdb-67a8-4c57-8cc2-44625fd029fb'
  AND notes LIKE 'ROOMQC-DEMO-%';

-- Remove children with RESTRICT foreign keys before their parents.
DELETE FROM public.stock_adjustment_items sai
WHERE sai.adjustment_id IN (SELECT id FROM _demo_adjustments);

DELETE FROM public.purchase_order_items poi
WHERE poi.po_id IN (SELECT id FROM _demo_pos)
   OR poi.item_id IN (SELECT id FROM _demo_items);

DELETE FROM public.laundry_batch_audit lba
WHERE lba.batch_id IN (SELECT id FROM _demo_batches);

DELETE FROM public.laundry_batch_items lbi
WHERE lbi.batch_id IN (SELECT id FROM _demo_batches)
   OR lbi.item_id IN (SELECT id FROM _demo_items);

DELETE FROM public.inventory_transactions it
WHERE it.tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND (it.item_id IN (SELECT id FROM _demo_items)
       OR it.notes = 'ROOMQC-DEMO'
       OR it.transaction_code LIKE 'ROOMQC-DEMO-%');

DELETE FROM public.stock_adjustments
WHERE id IN (SELECT id FROM _demo_adjustments);

DELETE FROM public.room_checks
WHERE room_id IN (SELECT id FROM _demo_rooms)
   OR notes = 'ROOMQC-DEMO';

DELETE FROM public.maintenance_requests
WHERE room_id IN (SELECT id FROM _demo_rooms)
   OR item_id IN (SELECT id FROM _demo_items)
   OR notes LIKE 'ROOMQC-DEMO-%';

DELETE FROM public.room_items
WHERE room_id IN (SELECT id FROM _demo_rooms)
   OR item_id IN (SELECT id FROM _demo_items);

DELETE FROM public.room_type_standards
WHERE item_id IN (SELECT id FROM _demo_items);

DELETE FROM public.laundry_batches
WHERE id IN (SELECT id FROM _demo_batches);

DELETE FROM public.purchase_orders
WHERE id IN (SELECT id FROM _demo_pos);

DELETE FROM public.vendors
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND code LIKE 'ROOMQC-DEMO-%';

DELETE FROM public.laundry_vendors
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND code LIKE 'ROOMQC-DEMO-%';

DELETE FROM public.rooms
WHERE id IN (SELECT id FROM _demo_rooms);

DELETE FROM public.items
WHERE id IN (SELECT id FROM _demo_items);

DELETE FROM public.notifications
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND title LIKE 'ROOMQC-DEMO%';

DELETE FROM public.activity_logs
WHERE tenant_id = '81df5f81-afb2-4730-93f6-c85fce93006a'
  AND description LIKE 'ROOMQC-DEMO%';

-- These categories were created by the demo seed and have no remaining item
-- references after the deletes above.
COMMIT;
