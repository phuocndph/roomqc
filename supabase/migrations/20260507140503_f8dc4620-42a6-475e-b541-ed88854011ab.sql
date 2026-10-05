-- Add approval workflow to chargeable_consumptions
ALTER TABLE public.chargeable_consumptions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text;

-- Validation trigger (avoid CHECK with mutable values)
CREATE OR REPLACE FUNCTION public.validate_chargeable_approval_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid approval_status: %', NEW.approval_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_chargeable_approval ON public.chargeable_consumptions;
CREATE TRIGGER trg_validate_chargeable_approval
  BEFORE INSERT OR UPDATE ON public.chargeable_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.validate_chargeable_approval_status();

CREATE INDEX IF NOT EXISTS idx_chargeable_consumptions_approval
  ON public.chargeable_consumptions (tenant_id, approval_status, is_billed);

-- RPC: approve/reject chargeable consumptions
CREATE OR REPLACE FUNCTION public.review_chargeable_consumptions(
  p_ids uuid[],
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_count int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = v_user LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  UPDATE public.chargeable_consumptions
  SET approval_status = p_decision,
      reviewed_by = v_user,
      reviewed_at = now(),
      reject_reason = CASE WHEN p_decision = 'rejected' THEN p_reason ELSE NULL END,
      updated_at = now()
  WHERE id = ANY(p_ids)
    AND tenant_id = v_tenant
    AND is_billed = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_chargeable_consumptions(uuid[], text, text) TO authenticated;