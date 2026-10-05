-- Add created_by column to vendors table
ALTER TABLE public.vendors 
ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Create index for better query performance
CREATE INDEX idx_vendors_created_by ON public.vendors(created_by);

-- Update existing vendors to set created_by to the first user in the tenant (if any exist)
UPDATE public.vendors v
SET created_by = (
  SELECT u.id 
  FROM public.users u 
  WHERE u.tenant_id = v.tenant_id 
  LIMIT 1
)
WHERE created_by IS NULL;

COMMENT ON COLUMN public.vendors.created_by IS 'User who created this vendor record';