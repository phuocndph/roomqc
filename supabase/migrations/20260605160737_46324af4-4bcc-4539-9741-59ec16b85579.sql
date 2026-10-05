
DROP FUNCTION IF EXISTS public.get_categories_with_stats(uuid);
DROP FUNCTION IF EXISTS public.get_monthly_expenses(uuid, integer);
DROP FUNCTION IF EXISTS public.get_recent_activities(uuid, integer);
DROP FUNCTION IF EXISTS public.get_distribution_orders_filtered(uuid, uuid, text, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_items_filtered(uuid, uuid, uuid, text, text, text, integer, integer);
