UPDATE public.chargeable_consumptions
SET approval_status = 'approved'
WHERE approval_status = 'pending'
  AND created_at < now() - interval '1 minute';