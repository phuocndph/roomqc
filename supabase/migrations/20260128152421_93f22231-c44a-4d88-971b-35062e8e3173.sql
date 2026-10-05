-- Allow anonymous/public SELECT on booking_payments by ID (for QR page)
CREATE POLICY "Allow public read booking_payments by id" 
ON public.booking_payments 
FOR SELECT 
USING (true);

-- Allow public SELECT on active bank_payment_settings (for QR page display)
CREATE POLICY "Allow public read active bank_payment_settings" 
ON public.bank_payment_settings 
FOR SELECT 
USING (is_active = true);