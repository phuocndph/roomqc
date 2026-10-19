-- Metrics may latch admission closed but cannot approve reopening it.
CREATE FUNCTION roomqc_control.guard_operator_reopen() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.operator_reopen_required AND NOT NEW.operator_reopen_required
    AND NOT pg_has_role(current_user,'roomqc_control_api','USAGE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only the admin API may approve reopening admission';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_operator_reopen() FROM PUBLIC;
CREATE TRIGGER guard_operator_reopen BEFORE UPDATE OF operator_reopen_required
  ON roomqc_control.cluster_policies FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_operator_reopen();
CREATE INDEX cluster_health_expiry_idx ON roomqc_control.cluster_health_current(valid_until,cluster_id)
  WHERE metric_status<>'unknown';
