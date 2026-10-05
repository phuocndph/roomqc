ALTER TABLE public.guest_invoices ADD COLUMN IF NOT EXISTS guest_email TEXT;
ALTER TABLE public.guest_invoices ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;