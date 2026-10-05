-- Add investigation workflow columns to stock_adjustment_items
ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS investigation_status TEXT DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS investigation_notes TEXT DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS investigation_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS investigation_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS resolution_type TEXT DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS resolution_notes TEXT DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS responsible_person_id UUID REFERENCES public.users(id) DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS linked_document_type TEXT DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS linked_document_id UUID DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) DEFAULT NULL;

ALTER TABLE public.stock_adjustment_items 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment for investigation_status enum
COMMENT ON COLUMN public.stock_adjustment_items.investigation_status IS 'Values: pending, investigating, resolved';

-- Add comment for resolution_type enum  
COMMENT ON COLUMN public.stock_adjustment_items.resolution_type IS 'Values: adjust_stock, compensation, supplementary_in, supplementary_out';

-- Add comment for linked_document_type enum
COMMENT ON COLUMN public.stock_adjustment_items.linked_document_type IS 'Values: inventory_transaction, compensation_request, investigation_ticket';

-- Add index for filtering by investigation status
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_investigation_status 
ON public.stock_adjustment_items(investigation_status) 
WHERE investigation_status IS NOT NULL;