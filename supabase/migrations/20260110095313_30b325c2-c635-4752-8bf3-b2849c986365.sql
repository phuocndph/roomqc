-- Add approved_at column to stock_adjustments table
ALTER TABLE public.stock_adjustments
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;