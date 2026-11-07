-- Server-owned installation identity, retained with directory backup/restore.
-- Never read this audience from an HTTP caller. A restored writer must still
-- be fenced operationally before routing; this UUID is not a writer lease.
CREATE TABLE roomqc_control.support_authority_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  audience uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
INSERT INTO roomqc_control.support_authority_identity(singleton) VALUES(true);
ALTER TABLE roomqc_control.support_actions ADD COLUMN command_key text;
ALTER TABLE roomqc_control.support_actions ADD COLUMN payload_hash text;
ALTER TABLE roomqc_control.support_actions ADD CONSTRAINT support_action_command_context
  CHECK((command_key IS NULL AND payload_hash IS NULL) OR
    (command_key IS NOT NULL AND payload_hash IS NOT NULL AND command_key~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' AND payload_hash~'^[a-f0-9]{64}$'));

CREATE TABLE roomqc_control.support_command_acceptances (
  acceptance_id uuid PRIMARY KEY,protocol_version integer NOT NULL CHECK(protocol_version=1),
  audience uuid NOT NULL REFERENCES roomqc_control.support_authority_identity(audience),
  actor_id uuid NOT NULL,authority_cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  session_id uuid NOT NULL,attempt_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN('cluster_command','register_cluster','acknowledge_alert','recheck_workspace','reconcile_workspace')),
  target text NOT NULL,request_key text NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
  accepted_at_ms bigint NOT NULL,observed_at_ms bigint NOT NULL,expires_at_ms bigint NOT NULL,
  control_command_id uuid UNIQUE REFERENCES roomqc_control.control_commands(id),
  recheck_command_id uuid UNIQUE REFERENCES roomqc_control.workspace_recheck_commands(id),
  support_action_id uuid UNIQUE REFERENCES roomqc_control.support_actions(id),
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(num_nonnulls(control_command_id,recheck_command_id,support_action_id)=1),
  CHECK(accepted_at_ms>0 AND observed_at_ms>=accepted_at_ms AND observed_at_ms<expires_at_ms
    AND expires_at_ms>accepted_at_ms AND expires_at_ms-accepted_at_ms<=5000),
  UNIQUE(actor_id,authority_cluster_id,session_id,attempt_id)
);
CREATE INDEX support_command_acceptances_authority_idx ON roomqc_control.support_command_acceptances(authority_cluster_id);
CREATE INDEX support_command_acceptances_audience_idx ON roomqc_control.support_command_acceptances(audience);

CREATE FUNCTION roomqc_control.guard_support_acceptance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a uuid;c text;o text;t text;k text;h text;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'SUPPORT_ACCEPTANCE_HISTORY_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  IF NEW.control_command_id IS NOT NULL THEN
    SELECT actor_id,authority_cluster_id,
      CASE WHEN operation IN('register_cluster','acknowledge_alert') THEN operation ELSE 'cluster_command' END,
      target_id,idempotency_key,payload_hash INTO a,c,o,t,k,h
    FROM roomqc_control.control_commands WHERE id=NEW.control_command_id AND status='succeeded';
  ELSIF NEW.recheck_command_id IS NOT NULL THEN
    SELECT actor_id,authority_cluster_id,'recheck_workspace',workspace_id::text,idempotency_key::text,payload_hash
      INTO a,c,o,t,k,h FROM roomqc_control.workspace_recheck_commands WHERE id=NEW.recheck_command_id;
  ELSE
    SELECT actor_id,authority_cluster_id,'reconcile_workspace',workspace_id::text,command_key,payload_hash
      INTO a,c,o,t,k,h FROM roomqc_control.support_actions WHERE id=NEW.support_action_id AND outcome='reconciled';
  END IF;
  IF NOT FOUND OR ROW(a,c,o,t,k,h) IS DISTINCT FROM
    ROW(NEW.actor_id,NEW.authority_cluster_id,NEW.operation,NEW.target,NEW.request_key,NEW.payload_hash) THEN
    RAISE EXCEPTION 'SUPPORT_ACCEPTANCE_COMMAND_MISMATCH' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_command_acceptances_guard BEFORE INSERT OR UPDATE OR DELETE
  ON roomqc_control.support_command_acceptances FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_acceptance();
CREATE FUNCTION roomqc_control.guard_support_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
  RAISE EXCEPTION 'SUPPORT_AUTHORITY_IDENTITY_IMMUTABLE' USING ERRCODE='42501';
END $$;
CREATE TRIGGER support_authority_identity_immutable BEFORE INSERT OR UPDATE OR DELETE
  ON roomqc_control.support_authority_identity FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_identity();
REVOKE ALL ON roomqc_control.support_authority_identity,roomqc_control.support_command_acceptances FROM PUBLIC;
REVOKE ALL ON FUNCTION roomqc_control.guard_support_acceptance(),roomqc_control.guard_support_identity() FROM PUBLIC;
GRANT SELECT ON roomqc_control.support_authority_identity TO roomqc_control_api;
GRANT SELECT,INSERT ON roomqc_control.support_command_acceptances TO roomqc_control_api;
