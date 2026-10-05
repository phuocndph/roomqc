ALTER TABLE public.guest_invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'receipt',
  ADD COLUMN IF NOT EXISTS accountant_email text;

UPDATE public.guest_invoices SET invoice_type = 'receipt' WHERE invoice_type IS NULL OR invoice_type = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_invoices_invoice_type_check'
  ) THEN
    ALTER TABLE public.guest_invoices
      ADD CONSTRAINT guest_invoices_invoice_type_check
      CHECK (invoice_type IN ('receipt', 'vat_request'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_guest_invoices_invoice_type
  ON public.guest_invoices (hotel_id, invoice_type, created_at DESC);