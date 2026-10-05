
-- Bảng 1: hotel_fixed_expenses
CREATE TABLE IF NOT EXISTS public.hotel_fixed_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  month date NOT NULL,
  category text NOT NULL,
  label text,
  amount numeric(15, 0) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_fixed_expenses_category_check
    CHECK (category IN ('salary', 'rent', 'utilities', 'insurance', 'marketing', 'other')),
  UNIQUE (hotel_id, month, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_fixed_expenses TO authenticated;
GRANT ALL ON public.hotel_fixed_expenses TO service_role;

ALTER TABLE public.hotel_fixed_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view fixed expenses"
  ON public.hotel_fixed_expenses FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can insert fixed expenses"
  ON public.hotel_fixed_expenses FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can update fixed expenses"
  ON public.hotel_fixed_expenses FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can delete fixed expenses"
  ON public.hotel_fixed_expenses FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE TRIGGER trg_hotel_fixed_expenses_updated_at
  BEFORE UPDATE ON public.hotel_fixed_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_hotel_fixed_expenses_hotel_month
  ON public.hotel_fixed_expenses(hotel_id, month);

-- Bảng 2: monthly_targets
CREATE TABLE IF NOT EXISTS public.monthly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  month date NOT NULL,
  revenue_target numeric(15, 0),
  occupancy_target numeric(5, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_targets TO authenticated;
GRANT ALL ON public.monthly_targets TO service_role;

ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view monthly targets"
  ON public.monthly_targets FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can insert monthly targets"
  ON public.monthly_targets FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can update monthly targets"
  ON public.monthly_targets FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can delete monthly targets"
  ON public.monthly_targets FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE TRIGGER trg_monthly_targets_updated_at
  BEFORE UPDATE ON public.monthly_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bảng 3: shift_notes
CREATE TABLE IF NOT EXISTS public.shift_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid REFERENCES public.hotels(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  content text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_notes TO authenticated;
GRANT ALL ON public.shift_notes TO service_role;

ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view shift notes"
  ON public.shift_notes FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can insert shift notes"
  ON public.shift_notes FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can update shift notes"
  ON public.shift_notes FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Tenant members can delete shift notes"
  ON public.shift_notes FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

CREATE TRIGGER trg_shift_notes_updated_at
  BEFORE UPDATE ON public.shift_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_shift_notes_hotel_date ON public.shift_notes(hotel_id, note_date);
