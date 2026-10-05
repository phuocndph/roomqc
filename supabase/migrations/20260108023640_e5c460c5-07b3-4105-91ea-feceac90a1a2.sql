-- Remove all anonymous access policies from password_reset_otps table
-- All OTP operations must go through Edge Functions using service_role_key

DROP POLICY IF EXISTS "Anonymous can read OTPs for verification" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Anonymous can create OTPs for password reset" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Anonymous can delete used OTPs" ON public.password_reset_otps;