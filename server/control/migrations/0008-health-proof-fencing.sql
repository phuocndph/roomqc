-- Directory only. Health/admission need metadata, never credential material.
GRANT SELECT(cluster_id,credential_ref,binding_hash,revision,state,auth_expires_at,probe_expires_at)
  ON roomqc_control.probe_credentials TO roomqc_control_api,roomqc_control_worker,roomqc_control_metrics;

-- Serialize even direct authorized credential writes with health/admission.
-- BEFORE STATEMENT is important: acquire the advisory lock BEFORE taking row
-- locks, matching the stores' lock order and avoiding a row/advisory deadlock.
CREATE FUNCTION roomqc_control.fence_probe_credentials() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(727001);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.fence_probe_credentials() FROM PUBLIC;
CREATE TRIGGER fence_probe_credentials BEFORE INSERT OR UPDATE OR DELETE ON roomqc_control.probe_credentials
  FOR EACH STATEMENT EXECUTE FUNCTION roomqc_control.fence_probe_credentials();
