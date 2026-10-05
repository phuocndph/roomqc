-- Sprint 3.1: payment_anomalies for SePay reconciliation
CREATE TYPE public.payment_anomaly_type AS ENUM ('unmatched', 'amount_mismatch', 'duplicate');
CREATE TYPE public.payment_anomaly_status AS ENUM ('open', 'resolved', 'ignored');

CREATE TABLE public.payment_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  anomaly_type public.payment_anomaly_type NOT NULL,
  status public.payment_anomaly_status NOT NULL DEFAULT 'open',

  -- SePay transaction info
  sepay_tx_id TEXT NOT NULL,
  sepay_reference TEXT,
  sepay_content TEXT,
  sepay_amount BIGINT NOT NULL,
  sepay_date TIMESTAMPTZ,
  sepay_account TEXT,

  -- Expected payment (when partial match exists)
  expected_payment_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  expected_invoice_number TEXT,
  expected_amount BIGINT,
  amount_diff BIGINT,

  -- Resolution
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (sepay_tx_id, anomaly_type)
);

CREATE INDEX idx_payment_anomalies_tenant_status ON public.payment_anomalies (tenant_id, status, created_at DESC);
CREATE INDEX idx_payment_anomalies_status ON public.payment_anomalies (status, created_at DESC) WHERE status = 'open';

ALTER TABLE public.payment_anomalies ENABLE ROW LEVEL SECURITY;

-- Owner / Super Admin của tenant xem được
CREATE POLICY "anomalies_select_owner"
ON public.payment_anomalies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.user_level_code = 'super_admin'
        OR (u.user_level_code = 'tenant_owner' AND u.tenant_id = payment_anomalies.tenant_id)
      )
  )
);

-- Owner update để đánh dấu resolved/ignored
CREATE POLICY "anomalies_update_owner"
ON public.payment_anomalies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.user_level_code = 'super_admin'
        OR (u.user_level_code = 'tenant_owner' AND u.tenant_id = payment_anomalies.tenant_id)
      )
  )
);

-- updated_at trigger
CREATE TRIGGER trg_payment_anomalies_updated_at
BEFORE UPDATE ON public.payment_anomalies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
