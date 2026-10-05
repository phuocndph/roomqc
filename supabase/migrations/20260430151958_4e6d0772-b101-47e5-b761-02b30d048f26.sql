-- Phase 1 Lượt 3: Rate limit table + helper RPC
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_bucket_time
  ON public.rate_limit_hits (bucket_key, hit_at DESC);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write directly; no public policies => locked down
CREATE POLICY "service role manages rate limit hits"
  ON public.rate_limit_hits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper: returns true if within limit (and records hit), false if exceeded
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket_key text,
  _max_hits int,
  _window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  -- Cleanup old hits opportunistically (cheap due to index)
  DELETE FROM public.rate_limit_hits
  WHERE bucket_key = _bucket_key
    AND hit_at < now() - make_interval(secs => _window_seconds);

  SELECT count(*) INTO _count
  FROM public.rate_limit_hits
  WHERE bucket_key = _bucket_key
    AND hit_at >= now() - make_interval(secs => _window_seconds);

  IF _count >= _max_hits THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket_key) VALUES (_bucket_key);
  RETURN true;
END;
$$;

-- Periodic cleanup (anything older than 1 day)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_hits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_hits WHERE hit_at < now() - interval '1 day';
$$;