-- Add new fields to hotels table for comprehensive management
ALTER TABLE public.hotels
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'hotel',
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Vietnam',
ADD COLUMN IF NOT EXISTS postal_code text,
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS manager_name text,
ADD COLUMN IF NOT EXISTS manager_email text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS inactive_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS inactive_reason text;

-- Add check constraint for type
ALTER TABLE public.hotels
DROP CONSTRAINT IF EXISTS hotels_type_check;

ALTER TABLE public.hotels
ADD CONSTRAINT hotels_type_check 
CHECK (type IN ('hotel', 'resort', 'apartment', 'hostel', 'other'));

-- Add check constraint for status
ALTER TABLE public.hotels
DROP CONSTRAINT IF EXISTS hotels_status_check;

ALTER TABLE public.hotels
ADD CONSTRAINT hotels_status_check 
CHECK (status IN ('active', 'inactive', 'maintenance'));

-- Create index on manager_id for faster queries
CREATE INDEX IF NOT EXISTS idx_hotels_manager_id ON public.hotels(manager_id);

-- Create index on city for filtering
CREATE INDEX IF NOT EXISTS idx_hotels_city ON public.hotels(city);

-- Create index on type for filtering
CREATE INDEX IF NOT EXISTS idx_hotels_type ON public.hotels(type);

-- Add comment
COMMENT ON TABLE public.hotels IS 'Stores hotel/property information for multi-property management';