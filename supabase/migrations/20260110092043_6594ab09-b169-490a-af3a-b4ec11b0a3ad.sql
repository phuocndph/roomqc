-- Create investigation_logs table for audit trail
CREATE TABLE public.investigation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Source reference
  entity_type TEXT NOT NULL, -- stock_adjustment_item, compensation_request
  entity_id UUID NOT NULL,
  adjustment_id UUID REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  
  -- Action details
  action TEXT NOT NULL, -- started, resolved, approved, rejected, compensation_created, compensation_paid
  previous_status TEXT,
  new_status TEXT,
  
  -- Resolution details (when applicable)
  resolution_type TEXT,
  reason_code TEXT,
  
  -- Notes and metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Actor
  performed_by UUID NOT NULL REFERENCES public.users(id),
  performed_by_name TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- IP for security audit
  ip_address INET
);

-- Enable RLS
ALTER TABLE public.investigation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view investigation logs in their tenant" 
  ON public.investigation_logs 
  FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create investigation logs in their tenant" 
  ON public.investigation_logs 
  FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_investigation_logs_tenant ON public.investigation_logs(tenant_id);
CREATE INDEX idx_investigation_logs_entity ON public.investigation_logs(entity_type, entity_id);
CREATE INDEX idx_investigation_logs_adjustment ON public.investigation_logs(adjustment_id);
CREATE INDEX idx_investigation_logs_action ON public.investigation_logs(action);
CREATE INDEX idx_investigation_logs_performed_at ON public.investigation_logs(performed_at DESC);

-- Add comment
COMMENT ON TABLE public.investigation_logs IS 'Audit trail for investigation and approval actions on stock adjustment items';