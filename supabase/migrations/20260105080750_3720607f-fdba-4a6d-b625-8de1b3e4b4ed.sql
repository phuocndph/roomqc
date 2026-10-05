-- Bảng lưu thông tin kết nối Telegram của user
CREATE TABLE public.telegram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  chat_type TEXT DEFAULT 'private' CHECK (chat_type IN ('private', 'group')),
  chat_title TEXT,
  username TEXT,
  first_name TEXT,
  is_active BOOLEAN DEFAULT true,
  notification_types TEXT[] DEFAULT ARRAY['all'],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chat_id)
);

-- Bảng lưu nhóm Telegram của tenant
CREATE TABLE public.telegram_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  chat_id TEXT NOT NULL UNIQUE,
  chat_title TEXT NOT NULL,
  group_type TEXT DEFAULT 'general' CHECK (group_type IN ('general', 'management', 'staff', 'owner')),
  notification_types TEXT[] DEFAULT ARRAY['all'],
  is_active BOOLEAN DEFAULT true,
  added_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for telegram_connections
CREATE POLICY "Users can view own telegram connections"
  ON public.telegram_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own telegram connections"
  ON public.telegram_connections FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for telegram_groups (tenant-based)
CREATE POLICY "Users can view tenant telegram groups"
  ON public.telegram_groups FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Owners and managers can manage telegram groups"
  ON public.telegram_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.users u ON u.id = ur.user_id
      WHERE ur.user_id = auth.uid()
      AND u.tenant_id = telegram_groups.tenant_id
      AND ur.role IN ('owner', 'hotel_manager')
    )
  );

-- Indexes
CREATE INDEX idx_telegram_connections_user ON public.telegram_connections(user_id);
CREATE INDEX idx_telegram_connections_tenant ON public.telegram_connections(tenant_id);
CREATE INDEX idx_telegram_groups_tenant ON public.telegram_groups(tenant_id);
CREATE INDEX idx_telegram_groups_hotel ON public.telegram_groups(hotel_id);

-- Updated at trigger
CREATE TRIGGER update_telegram_connections_updated_at
  BEFORE UPDATE ON public.telegram_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_groups_updated_at
  BEFORE UPDATE ON public.telegram_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();