-- Create table for pending group link requests
CREATE TABLE public.pending_group_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL,
  added_by uuid NOT NULL,
  
  -- Telegram user ID from telegram_connections
  telegram_user_id text NOT NULL,
  
  -- Pre-configured settings
  group_type text DEFAULT 'staff',
  department text,
  notification_types text[],
  
  -- Status tracking
  status text DEFAULT 'pending', -- pending, completed, expired
  chat_id text, -- Filled when completed
  
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '10 minutes')
);

-- Enable RLS
ALTER TABLE public.pending_group_links ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant's pending links"
ON public.pending_group_links FOR SELECT
USING (tenant_id IN (
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
));

CREATE POLICY "Users can create pending links for their tenant"
ON public.pending_group_links FOR INSERT
WITH CHECK (tenant_id IN (
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
));

CREATE POLICY "Users can update their tenant's pending links"
ON public.pending_group_links FOR UPDATE
USING (tenant_id IN (
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
));

-- Index for expiry cleanup
CREATE INDEX idx_pending_group_links_expires ON public.pending_group_links(expires_at);
CREATE INDEX idx_pending_group_links_telegram_user ON public.pending_group_links(telegram_user_id, status);

-- Enable realtime for telegram_groups (for auto-update UI)
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_groups;