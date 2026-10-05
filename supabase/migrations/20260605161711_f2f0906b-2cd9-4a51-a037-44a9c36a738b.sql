DROP FUNCTION IF EXISTS public.create_distribution_order(uuid, uuid, uuid, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.create_inbound_transaction(uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text[], text[], text);
DROP FUNCTION IF EXISTS public.create_outbound_transaction(uuid, uuid, text, text, text, uuid, jsonb, text, uuid, text, text, text[], text[], text);
DROP FUNCTION IF EXISTS public.create_laundry_loss_transaction(uuid, uuid, uuid, text, uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.create_laundry_return_transaction(uuid, uuid, uuid, text, uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.get_laundry_batches_filtered(uuid, uuid, uuid, text, date, date, integer, integer);
DROP FUNCTION IF EXISTS public.setup_new_tenant(uuid, text, text, integer, uuid);