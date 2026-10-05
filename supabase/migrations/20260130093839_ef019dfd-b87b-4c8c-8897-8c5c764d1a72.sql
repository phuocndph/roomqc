-- =====================================================
-- PHASE 1: supplement_requests table for tracking item replacement needs
-- =====================================================

-- Create supplement_requests table
CREATE TABLE public.supplement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_check_id UUID REFERENCES public.room_checks(id) ON DELETE SET NULL,
  request_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'cancelled')),
  request_type TEXT NOT NULL CHECK (request_type IN ('lost', 'consumed', 'damaged', 'mixed')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  transaction_id UUID REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_supplement_requests_tenant ON public.supplement_requests(tenant_id);
CREATE INDEX idx_supplement_requests_hotel ON public.supplement_requests(hotel_id);
CREATE INDEX idx_supplement_requests_room ON public.supplement_requests(room_id);
CREATE INDEX idx_supplement_requests_status ON public.supplement_requests(status);
CREATE INDEX idx_supplement_requests_created ON public.supplement_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.supplement_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view supplement requests in their tenant"
ON public.supplement_requests FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create supplement requests in their tenant"
ON public.supplement_requests FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update supplement requests in their tenant"
ON public.supplement_requests FOR UPDATE
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- =====================================================
-- PHASE 2: laundry_requests table for pending laundry items from room checks
-- =====================================================

-- Create laundry_requests table for items awaiting batch assignment
CREATE TABLE public.laundry_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_check_id UUID REFERENCES public.room_checks(id) ON DELETE SET NULL,
  request_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added_to_batch', 'cancelled')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  laundry_batch_id UUID REFERENCES public.laundry_batches(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_laundry_requests_tenant ON public.laundry_requests(tenant_id);
CREATE INDEX idx_laundry_requests_hotel ON public.laundry_requests(hotel_id);
CREATE INDEX idx_laundry_requests_status ON public.laundry_requests(status);
CREATE INDEX idx_laundry_requests_batch ON public.laundry_requests(laundry_batch_id);
CREATE INDEX idx_laundry_requests_created ON public.laundry_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.laundry_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view laundry requests in their tenant"
ON public.laundry_requests FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can create laundry requests in their tenant"
ON public.laundry_requests FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can update laundry requests in their tenant"
ON public.laundry_requests FOR UPDATE
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- =====================================================
-- Function to generate request codes
-- =====================================================

CREATE OR REPLACE FUNCTION public.generate_supplement_request_code(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_count INTEGER;
  v_code TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.supplement_requests
  WHERE tenant_id = p_tenant_id
    AND DATE(created_at) = v_today;
  
  v_code := 'SUP-' || TO_CHAR(v_today, 'YYMMDD') || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_laundry_request_code(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_count INTEGER;
  v_code TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.laundry_requests
  WHERE tenant_id = p_tenant_id
    AND DATE(created_at) = v_today;
  
  v_code := 'LRQ-' || TO_CHAR(v_today, 'YYMMDD') || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN v_code;
END;
$$;

-- =====================================================
-- Function to auto-add laundry items to draft batch
-- =====================================================

CREATE OR REPLACE FUNCTION public.add_laundry_to_draft_batch(
  p_tenant_id UUID,
  p_hotel_id UUID,
  p_laundry_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_today DATE := CURRENT_DATE;
  v_batch_code TEXT;
  v_request RECORD;
  v_item RECORD;
  v_existing_item_id UUID;
BEGIN
  -- Get the laundry request
  SELECT * INTO v_request
  FROM public.laundry_requests
  WHERE id = p_laundry_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laundry request not found';
  END IF;

  -- Find or create draft batch for today
  SELECT id INTO v_batch_id
  FROM public.laundry_batches
  WHERE tenant_id = p_tenant_id
    AND hotel_id = p_hotel_id
    AND status = 'draft'
    AND DATE(created_at) = v_today
  LIMIT 1;

  IF v_batch_id IS NULL THEN
    -- Generate batch code
    SELECT 'LB-' || TO_CHAR(v_today, 'YYMMDD') || '-' || 
           LPAD((COUNT(*) + 1)::TEXT, 3, '0')
    INTO v_batch_code
    FROM public.laundry_batches
    WHERE tenant_id = p_tenant_id
      AND DATE(created_at) = v_today;

    -- Create new draft batch
    INSERT INTO public.laundry_batches (
      tenant_id, hotel_id, batch_code, status, total_items, notes
    ) VALUES (
      p_tenant_id, p_hotel_id, v_batch_code, 'draft', 0, 'Auto-created from room checks'
    )
    RETURNING id INTO v_batch_id;
  END IF;

  -- Add items to batch
  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_request.items) 
    AS x(item_id UUID, item_name TEXT, quantity INTEGER, item_code TEXT)
  LOOP
    -- Check if item already exists in batch
    SELECT id INTO v_existing_item_id
    FROM public.laundry_batch_items
    WHERE batch_id = v_batch_id AND item_id = v_item.item_id;

    IF v_existing_item_id IS NOT NULL THEN
      -- Update existing item quantity
      UPDATE public.laundry_batch_items
      SET sent_quantity = sent_quantity + v_item.quantity,
          updated_at = now()
      WHERE id = v_existing_item_id;
    ELSE
      -- Insert new item
      INSERT INTO public.laundry_batch_items (
        batch_id, item_id, sent_quantity
      ) VALUES (
        v_batch_id, v_item.item_id, v_item.quantity
      );
    END IF;
  END LOOP;

  -- Update batch total
  UPDATE public.laundry_batches
  SET total_items = (
    SELECT COALESCE(SUM(sent_quantity), 0)
    FROM public.laundry_batch_items
    WHERE batch_id = v_batch_id
  ),
  updated_at = now()
  WHERE id = v_batch_id;

  -- Update laundry request status
  UPDATE public.laundry_requests
  SET status = 'added_to_batch',
      laundry_batch_id = v_batch_id,
      added_at = now(),
      updated_at = now()
  WHERE id = p_laundry_request_id;

  RETURN v_batch_id;
END;
$$;

-- =====================================================
-- Enable realtime for new tables
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplement_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.laundry_requests;

-- =====================================================
-- Updated timestamp trigger
-- =====================================================
CREATE TRIGGER update_supplement_requests_updated_at
  BEFORE UPDATE ON public.supplement_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_laundry_requests_updated_at
  BEFORE UPDATE ON public.laundry_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();