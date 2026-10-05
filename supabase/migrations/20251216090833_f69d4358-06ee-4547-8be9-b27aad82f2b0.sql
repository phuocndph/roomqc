-- Add items_lost column to room_checks table
ALTER TABLE public.room_checks 
ADD COLUMN IF NOT EXISTS items_lost jsonb DEFAULT '[]'::jsonb;