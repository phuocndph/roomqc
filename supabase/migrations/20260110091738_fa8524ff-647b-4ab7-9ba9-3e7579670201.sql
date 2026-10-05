-- Create compensation_requests table for tracking compensation from staff
CREATE TABLE public.compensation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  
  -- Request details
  request_code TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'inventory_shortage', -- inventory_shortage, damage, loss, other
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, paid, cancelled
  
  -- Source reference
  source_type TEXT, -- stock_adjustment_item, maintenance_request, etc.
  source_id UUID,
  
  -- Responsible person
  responsible_person_id UUID REFERENCES public.users(id),
  responsible_person_name TEXT,
  
  -- Item details
  item_id UUID REFERENCES public.items(id),
  item_name TEXT,
  item_code TEXT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Resolution
  resolution_notes TEXT,
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_method TEXT, -- cash, salary_deduction, bank_transfer
  payment_reference TEXT,
  
  -- Audit
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_request_code_per_tenant UNIQUE (tenant_id, request_code)
);

-- Enable RLS
ALTER TABLE public.compensation_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view compensation requests in their tenant" 
  ON public.compensation_requests 
  FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create compensation requests in their tenant" 
  ON public.compensation_requests 
  FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update compensation requests in their tenant" 
  ON public.compensation_requests 
  FOR UPDATE 
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_compensation_requests_tenant ON public.compensation_requests(tenant_id);
CREATE INDEX idx_compensation_requests_hotel ON public.compensation_requests(hotel_id);
CREATE INDEX idx_compensation_requests_status ON public.compensation_requests(status);
CREATE INDEX idx_compensation_requests_responsible ON public.compensation_requests(responsible_person_id);
CREATE INDEX idx_compensation_requests_source ON public.compensation_requests(source_type, source_id);

-- Trigger for updated_at
CREATE TRIGGER update_compensation_requests_updated_at
  BEFORE UPDATE ON public.compensation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.compensation_requests;

-- Add comment
COMMENT ON TABLE public.compensation_requests IS 'Tracks compensation requests for inventory shortages, damages, and losses';