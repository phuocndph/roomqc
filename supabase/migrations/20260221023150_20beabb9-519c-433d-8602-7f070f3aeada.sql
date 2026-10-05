ALTER POLICY "Users can view their tenant bank settings" 
ON public.bank_payment_settings 
USING (
  (is_active = true) AND (
    is_super_admin() 
    OR (tenant_id IN (
      SELECT users.tenant_id FROM users WHERE users.id = auth.uid()
    ))
    OR (hotel_id IS NULL AND tenant_id IS NULL)
  )
);