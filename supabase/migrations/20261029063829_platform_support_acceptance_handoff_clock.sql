-- The remote clock is sampled AFTER the acceptance function has returned.
-- Consumers subtract the complete monotonic RPC/handoff elapsed time from
-- this remaining lifetime; they never compare two hosts' wall clocks.
CREATE OR REPLACE FUNCTION public.accept_platform_support_command(p_attempt_id uuid,p_audience uuid,p_operation text,
  p_target text,p_request_key text,p_payload_sha256 text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  WITH acceptance AS MATERIALIZED (
    SELECT roomqc_support.accept_command(p_attempt_id,p_audience,p_operation,p_target,p_request_key,p_payload_sha256) AS receipt
  )
  SELECT receipt||jsonb_build_object('observedAtMs',floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
  FROM acceptance;
$fn$;
REVOKE ALL ON FUNCTION public.accept_platform_support_command(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_platform_support_command(uuid,uuid,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
