
-- Drop old overloaded versions of perform_checkout (keep only the latest with p_check_out_date)
DROP FUNCTION IF EXISTS public.perform_checkout(uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.perform_checkout(uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb);
DROP FUNCTION IF EXISTS public.perform_checkout(uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, numeric);
