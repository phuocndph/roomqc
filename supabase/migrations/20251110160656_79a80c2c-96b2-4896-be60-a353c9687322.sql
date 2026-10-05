-- Create workflows table
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('event', 'schedule', 'manual')),
  trigger_event TEXT, -- e.g., 'inventory.low_stock', 'laundry.overdue'
  trigger_schedule TEXT, -- Cron expression for scheduled workflows
  
  -- Conditions (JSON array)
  conditions JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed')),
  last_error TEXT,
  
  -- Stats
  total_executions INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create workflow_actions table
CREATE TABLE IF NOT EXISTS public.workflow_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  
  -- Action configuration
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_maintenance',
    'create_purchase_order',
    'create_transaction',
    'send_notification',
    'send_email',
    'update_record',
    'webhook',
    'wait',
    'conditional'
  )),
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Order of execution
  order_index INTEGER NOT NULL DEFAULT 0,
  
  -- Execution settings
  continue_on_failure BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 0,
  retry_delay_seconds INTEGER DEFAULT 60,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create workflow_executions table
CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  
  -- Execution details
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  trigger_data JSONB, -- Data that triggered the workflow
  
  -- Results
  actions_completed INTEGER DEFAULT 0,
  actions_failed INTEGER DEFAULT 0,
  error_message TEXT,
  execution_log JSONB DEFAULT '[]'::jsonb, -- Array of action results
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON public.workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON public.workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON public.workflows(trigger_type, trigger_event);
CREATE INDEX IF NOT EXISTS idx_workflow_actions_workflow ON public.workflow_actions(workflow_id, order_index);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);

-- Enable RLS
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflows
CREATE POLICY "Users can view workflows from their tenant"
  ON public.workflows FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage workflows"
  ON public.workflows FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'owner', 'hotel_manager')
    )
  );

-- RLS Policies for workflow_actions
CREATE POLICY "Users can view workflow actions from their tenant"
  ON public.workflow_actions FOR SELECT
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Managers can manage workflow actions"
  ON public.workflow_actions FOR ALL
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'owner', 'hotel_manager')
    )
  );

-- RLS Policies for workflow_executions
CREATE POLICY "Users can view execution logs from their tenant"
  ON public.workflow_executions FOR SELECT
  TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    )
  );

-- Function to update workflow stats after execution
CREATE OR REPLACE FUNCTION update_workflow_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE public.workflows
    SET 
      last_run_at = NEW.completed_at,
      last_run_status = 'success',
      total_executions = total_executions + 1,
      success_count = success_count + 1,
      updated_at = now()
    WHERE id = NEW.workflow_id;
  ELSIF NEW.status = 'failed' THEN
    UPDATE public.workflows
    SET 
      last_run_at = NEW.completed_at,
      last_run_status = 'failed',
      last_error = NEW.error_message,
      total_executions = total_executions + 1,
      failed_count = failed_count + 1,
      updated_at = now()
    WHERE id = NEW.workflow_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update workflow stats
CREATE TRIGGER update_workflow_stats_trigger
  AFTER UPDATE ON public.workflow_executions
  FOR EACH ROW
  WHEN (OLD.status = 'running' AND NEW.status IN ('completed', 'failed'))
  EXECUTE FUNCTION update_workflow_stats();