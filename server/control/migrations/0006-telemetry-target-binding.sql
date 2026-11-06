-- Desired measurement identity is approved by the admin API, never by collectors.
ALTER TABLE roomqc_control.clusters
  ADD COLUMN telemetry_target_fingerprint text CHECK (telemetry_target_fingerprint ~ '^[a-f0-9]{64}$'),
  ADD COLUMN telemetry_target_definition jsonb CHECK (jsonb_typeof(telemetry_target_definition)='object'),
  ADD COLUMN telemetry_target_version bigint NOT NULL DEFAULT 0 CHECK (telemetry_target_version>=0),
  ADD COLUMN telemetry_target_bound_at timestamptz;
ALTER TABLE roomqc_control.clusters ADD CONSTRAINT telemetry_target_complete CHECK (
  (telemetry_target_fingerprint IS NULL AND telemetry_target_definition IS NULL AND telemetry_target_version=0 AND telemetry_target_bound_at IS NULL)
  OR (telemetry_target_fingerprint IS NOT NULL AND telemetry_target_definition IS NOT NULL AND telemetry_target_version>0 AND telemetry_target_bound_at IS NOT NULL)
);
-- A narrow trigger needs owner privileges to invalidate metrics without granting
-- the API permission to manufacture healthy samples. Not a callable RPC.
CREATE FUNCTION roomqc_control.invalidate_telemetry_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.telemetry_target_fingerprint IS DISTINCT FROM OLD.telemetry_target_fingerprint THEN
    IF NEW.telemetry_target_fingerprint IS NULL OR NEW.telemetry_target_definition IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Use a new approved target; removing a binding is not supported';
    END IF;
    NEW.telemetry_target_version=OLD.telemetry_target_version+1;
    NEW.telemetry_target_bound_at=clock_timestamp();
    UPDATE roomqc_control.cluster_health_current SET metric_status='unknown',
      reason_codes=ARRAY['METRICS_TARGET_CHANGED'],evaluator_state='{}'::jsonb,
      source_generation=greatest(nextval('roomqc_control.health_generation_seq'),source_generation+1)
      WHERE cluster_id=NEW.id;
    UPDATE roomqc_control.cluster_policies SET operator_reopen_required=true,manual_closed=true
      WHERE cluster_id=NEW.id;
  ELSE
    IF NEW.telemetry_target_definition IS DISTINCT FROM OLD.telemetry_target_definition THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Target definition requires a new approved fingerprint';
    END IF;
    NEW.telemetry_target_version=OLD.telemetry_target_version;
    NEW.telemetry_target_bound_at=OLD.telemetry_target_bound_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.invalidate_telemetry_target() FROM PUBLIC;
CREATE TRIGGER invalidate_telemetry_target BEFORE UPDATE OF telemetry_target_fingerprint,
  telemetry_target_definition,telemetry_target_version,telemetry_target_bound_at ON roomqc_control.clusters
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.invalidate_telemetry_target();
