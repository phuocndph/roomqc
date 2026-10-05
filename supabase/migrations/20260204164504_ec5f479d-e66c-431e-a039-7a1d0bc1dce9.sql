-- Add grace_period_ends_at column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

-- Create function to automatically calculate grace period end date
CREATE OR REPLACE FUNCTION public.calculate_grace_period_end()
RETURNS TRIGGER AS $$
BEGIN
  -- When subscription_end_date changes, calculate grace period (7 days after)
  IF NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date THEN
    IF NEW.subscription_end_date IS NOT NULL THEN
      NEW.grace_period_ends_at := (NEW.subscription_end_date::date + INTERVAL '7 days')::timestamptz;
    ELSE
      NEW.grace_period_ends_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-update grace_period_ends_at
DROP TRIGGER IF EXISTS trigger_calculate_grace_period ON public.tenants;
CREATE TRIGGER trigger_calculate_grace_period
  BEFORE INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_grace_period_end();

-- Update existing tenants to set grace_period_ends_at
UPDATE public.tenants 
SET grace_period_ends_at = (subscription_end_date::date + INTERVAL '7 days')::timestamptz
WHERE subscription_end_date IS NOT NULL 
  AND grace_period_ends_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.grace_period_ends_at IS 'Grace period end date (7 days after subscription_end_date). Users can still use the system during grace period but will see renewal warnings.';