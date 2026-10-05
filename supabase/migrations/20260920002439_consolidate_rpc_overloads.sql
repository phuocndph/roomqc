-- Keep one public signature for RPCs that were extended with optional fields.
-- The newer signatures retain defaults, so the older overloads are redundant
-- and can make PostgREST resolution ambiguous.
DROP FUNCTION IF EXISTS public.cancel_booking(uuid, uuid);

DROP FUNCTION IF EXISTS public.get_inventory_transactions_filtered(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  date,
  date,
  text,
  integer,
  integer
);
