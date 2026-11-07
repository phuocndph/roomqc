-- Directory only; versioned by migrateDirectory, NOT Supabase migration history.
-- Keep every existing migration checksum and credential row unchanged.
ALTER TABLE roomqc_control.probe_credentials
  DROP CONSTRAINT probe_credentials_state_check,
  DROP CONSTRAINT probe_credentials_reason_code_check,
  DROP CONSTRAINT probe_credential_state;
ALTER TABLE roomqc_control.probe_credentials
  ADD CONSTRAINT probe_credentials_state_check CHECK (state IN ('ready','refreshing','needs_recovery','disabled')),
  ADD CONSTRAINT probe_credentials_reason_code_check CHECK (reason_code IN ('REFRESH_UNCERTAIN','REFRESH_LEASE_EXPIRED','OPERATOR_DISABLED')),
  ADD CONSTRAINT probe_credential_state CHECK (
    (state='ready' AND lease_id IS NULL AND lease_until IS NULL AND reason_code IS NULL)
    OR (state='refreshing' AND lease_id IS NOT NULL AND lease_until IS NOT NULL AND reason_code IS NULL)
    OR (state='needs_recovery' AND lease_id IS NULL AND lease_until IS NULL AND reason_code IS NOT NULL
      AND reason_code IN ('REFRESH_UNCERTAIN','REFRESH_LEASE_EXPIRED'))
    OR (state='disabled' AND lease_id IS NULL AND lease_until IS NULL AND reason_code IS NOT NULL AND reason_code='OPERATOR_DISABLED')
  );

-- SECURITY INVOKER: the database login, never a JWT/HTTP claim, is authority.
-- The existing BEFORE STATEMENT fence obtains 727001 before any row locks.
CREATE FUNCTION roomqc_control.guard_probe_disable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.state='disabled' OR (TG_OP='UPDATE' AND OLD.state='disabled') THEN
    IF NOT pg_has_role(current_user,'roomqc_control_probe_installer','USAGE') THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PROBE_INSTALLER_REQUIRED';
    END IF;
    IF TG_OP='INSERT' THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PROBE_DISABLE_REQUIRES_EXISTING_CREDENTIAL';
    END IF;
    IF OLD.state='disabled' THEN
      IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
      -- Even an older installer cannot turn refresh quarantine into an
      -- alternate route around the new-session recovery requirement.
      IF NEW.state<>'ready' OR NEW.auth_user_id<>OLD.auth_user_id
        OR NEW.auth_session_id=OLD.auth_session_id OR NEW.revision<>OLD.revision+1 THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PROBE_DISABLE_RECOVERY_INVALID';
      END IF;
    ELSE
      IF NEW.revision<>OLD.revision+1
        OR (to_jsonb(NEW)-ARRAY['state','revision','lease_id','lease_until','reason_code','updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['state','revision','lease_id','lease_until','reason_code','updated_at']) THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PROBE_DISABLE_MUTATION_INVALID';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_probe_disable() FROM PUBLIC;
CREATE TRIGGER guard_probe_disable BEFORE INSERT OR UPDATE ON roomqc_control.probe_credentials
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_probe_disable();

-- Runtime can emit refresh/recovery events, but cannot claim installer action.
CREATE FUNCTION roomqc_control.guard_probe_installer_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.type IN ('probe_credentials_seeded','probe_credentials_rotated','probe_credentials_disabled')
    AND NOT pg_has_role(current_user,'roomqc_control_probe_installer','USAGE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PROBE_INSTALLER_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_probe_installer_audit() FROM PUBLIC;
CREATE TRIGGER guard_probe_installer_audit BEFORE INSERT ON roomqc_control.cluster_events
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_probe_installer_audit();
