
-- Helper to update an existing pg_cron job's command, preserving its schedule.
-- Restricted: only service_role can EXECUTE.
CREATE OR REPLACE FUNCTION public.exec_cron_update(_jobname text, _command text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_schedule text;
BEGIN
  SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = _jobname;
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'cron job % not found', _jobname;
  END IF;
  PERFORM cron.schedule(_jobname, v_schedule, _command);
END;
$$;

REVOKE ALL ON FUNCTION public.exec_cron_update(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_cron_update(text, text) TO service_role;
