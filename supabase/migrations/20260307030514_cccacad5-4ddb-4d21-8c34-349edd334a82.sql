ALTER TABLE public.inventory_transactions
ADD COLUMN IF NOT EXISTS reference_id UUID,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';