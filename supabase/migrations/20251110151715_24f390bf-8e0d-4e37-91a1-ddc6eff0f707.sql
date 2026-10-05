-- Create backups storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for backups bucket
-- Only super_admins and owners can access backups
CREATE POLICY "Admins can upload backups"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'backups' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'owner')
    )
  )
);

CREATE POLICY "Admins can view backups"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'backups' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'owner')
    )
  )
);

CREATE POLICY "Admins can delete backups"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'backups' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'owner')
    )
  )
);

-- Create backup_logs table to track backup history
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL, -- 'manual' or 'automatic'
  backup_scope TEXT[] NOT NULL, -- ['database', 'files', 'settings', 'logs']
  file_path TEXT, -- storage path
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  status TEXT NOT NULL, -- 'success', 'failed', 'in_progress'
  error_message TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backup_logs
CREATE POLICY "Users can view backup logs from their tenant"
ON public.backup_logs
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can insert backup logs"
ON public.backup_logs
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM users WHERE id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'owner')
  )
);

-- Create index for faster queries
CREATE INDEX idx_backup_logs_tenant_created ON public.backup_logs(tenant_id, created_at DESC);
CREATE INDEX idx_backup_logs_status ON public.backup_logs(status);