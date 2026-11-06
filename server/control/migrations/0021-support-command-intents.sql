-- Durable command identity and recovery generations. No Auth credential is
-- stored here. These tables do not authorize a new command: the verified
-- runtime must obtain a fresh, scoped canonical Auth acceptance for its round.
CREATE TABLE roomqc_control.support_command_intents (
  id uuid PRIMARY KEY,
  namespace_key text NOT NULL UNIQUE CHECK(namespace_key~'^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN('control','recheck','support')),
  actor_id uuid NOT NULL,
  authority_cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  operation text NOT NULL CHECK(operation~'^[a-z][a-z0-9_]{1,63}$'),
  acceptance_operation text NOT NULL CHECK(acceptance_operation IN
    ('cluster_command','register_cluster','acknowledge_alert','recheck_workspace','reconcile_workspace')),
  target text NOT NULL CHECK(target~'^[a-z0-9][a-z0-9-]{1,47}$'),
  request_key text NOT NULL CHECK(request_key~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((kind='control' AND acceptance_operation=CASE WHEN operation IN('register_cluster','acknowledge_alert') THEN operation ELSE 'cluster_command' END)
    OR (kind='recheck' AND operation='recheck' AND acceptance_operation='recheck_workspace')
    OR (kind='support' AND operation='reconcile' AND acceptance_operation='reconcile_workspace'))
);
-- Preserve the namespaces of the existing command tables. A different target
-- or authority must conflict, rather than quietly opening another intent.
CREATE UNIQUE INDEX support_intent_control_key ON roomqc_control.support_command_intents(actor_id,operation,request_key) WHERE kind='control';
CREATE UNIQUE INDEX support_intent_workspace_key ON roomqc_control.support_command_intents
  (kind,actor_id,authority_cluster_id,operation,target,request_key) WHERE kind IN('recheck','support');
CREATE INDEX support_intent_authority ON roomqc_control.support_command_intents(authority_cluster_id);

CREATE TABLE roomqc_control.support_command_attempts (
  intent_id uuid NOT NULL REFERENCES roomqc_control.support_command_intents(id),
  generation integer NOT NULL CHECK(generation>=0 AND generation<128),
  attempt_id uuid NOT NULL UNIQUE,session_id uuid NOT NULL,
  previous_generation integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(intent_id,generation),
  CHECK((generation=0 AND previous_generation IS NULL) OR (generation>0 AND previous_generation=generation-1))
);
CREATE TABLE roomqc_control.support_attempt_closures (
  intent_id uuid NOT NULL,generation integer NOT NULL,
  reason text NOT NULL CHECK(reason IN('acceptance_expired_no_effect','session_reauthorized_no_effect')),
  closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(intent_id,generation),
  FOREIGN KEY(intent_id,generation) REFERENCES roomqc_control.support_command_attempts(intent_id,generation)
);
ALTER TABLE roomqc_control.support_command_attempts ADD CONSTRAINT support_attempt_predecessor_closed
  FOREIGN KEY(intent_id,previous_generation) REFERENCES roomqc_control.support_attempt_closures(intent_id,generation);
CREATE TABLE roomqc_control.support_intent_results (
  intent_id uuid PRIMARY KEY,generation integer NOT NULL,
  acceptance_id uuid NOT NULL UNIQUE REFERENCES roomqc_control.support_command_acceptances(acceptance_id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(intent_id,generation) REFERENCES roomqc_control.support_command_attempts(intent_id,generation)
);

CREATE FUNCTION roomqc_control.guard_support_journal_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
  RAISE EXCEPTION 'SUPPORT_INTENT_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END $$;
CREATE TRIGGER support_intent_immutable BEFORE UPDATE OR DELETE ON roomqc_control.support_command_intents
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_history();
CREATE TRIGGER support_attempt_immutable BEFORE UPDATE OR DELETE ON roomqc_control.support_command_attempts
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_history();
CREATE TRIGGER support_closure_immutable BEFORE UPDATE OR DELETE ON roomqc_control.support_attempt_closures
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_history();
CREATE TRIGGER support_result_immutable BEFORE UPDATE OR DELETE ON roomqc_control.support_intent_results
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_history();

CREATE FUNCTION roomqc_control.guard_support_journal_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i roomqc_control.support_command_intents;a roomqc_control.support_command_attempts;
  c roomqc_control.support_command_acceptances;latest integer;has_effect boolean;
BEGIN
  -- The same row lock fences consumption and closure, even if an old API
  -- process does not hold the new session advisory lock.
  SELECT * INTO i FROM roomqc_control.support_command_intents WHERE id=NEW.intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_INTENT_REQUIRED' USING ERRCODE='42501';END IF;
  SELECT max(generation) INTO latest FROM roomqc_control.support_command_attempts WHERE intent_id=i.id;
  IF TG_TABLE_NAME='support_command_attempts' THEN
    IF NEW.generation<>coalesce(latest+1,0) OR EXISTS(SELECT 1 FROM roomqc_control.support_intent_results WHERE intent_id=i.id) THEN
      RAISE EXCEPTION 'SUPPORT_INTENT_GENERATION_CONFLICT' USING ERRCODE='42501';END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO a FROM roomqc_control.support_command_attempts WHERE intent_id=i.id AND generation=NEW.generation;
  IF NOT FOUND OR NEW.generation IS DISTINCT FROM latest THEN
    RAISE EXCEPTION 'SUPPORT_INTENT_GENERATION_CONFLICT' USING ERRCODE='42501';END IF;
  IF TG_TABLE_NAME='support_attempt_closures' THEN
    IF i.kind='control' THEN
      SELECT EXISTS(SELECT 1 FROM roomqc_control.control_commands WHERE actor_id=i.actor_id AND operation=i.operation AND idempotency_key=i.request_key) INTO has_effect;
    ELSIF i.kind='recheck' THEN
      SELECT EXISTS(SELECT 1 FROM roomqc_control.workspace_recheck_commands WHERE actor_id=i.actor_id AND authority_cluster_id=i.authority_cluster_id
        AND operation=i.operation AND workspace_id::text=i.target AND idempotency_key::text=i.request_key) INTO has_effect;
    ELSE
      SELECT EXISTS(SELECT 1 FROM roomqc_control.support_actions WHERE actor_id=i.actor_id AND authority_cluster_id=i.authority_cluster_id
        AND workspace_id::text=i.target AND command_key=i.request_key AND outcome='reconciled') INTO has_effect;
    END IF;
    IF has_effect OR EXISTS(SELECT 1 FROM roomqc_control.support_intent_results WHERE intent_id=i.id)
      OR EXISTS(SELECT 1 FROM roomqc_control.support_command_acceptances WHERE actor_id=i.actor_id
        AND authority_cluster_id=i.authority_cluster_id AND session_id=a.session_id AND attempt_id=a.attempt_id) THEN
      RAISE EXCEPTION 'SUPPORT_INTENT_EFFECT_ALREADY_COMMITTED' USING ERRCODE='42501';END IF;
  ELSE
    SELECT * INTO c FROM roomqc_control.support_command_acceptances WHERE acceptance_id=NEW.acceptance_id;
    IF NOT FOUND OR ROW(c.actor_id,c.authority_cluster_id,c.session_id,c.attempt_id,c.operation,c.target,c.request_key,c.payload_hash)
      IS DISTINCT FROM ROW(i.actor_id,i.authority_cluster_id,a.session_id,a.attempt_id,i.acceptance_operation,i.target,i.request_key,i.payload_hash)
      OR (i.kind='control' AND c.control_command_id IS NULL) OR (i.kind='recheck' AND c.recheck_command_id IS NULL)
      OR (i.kind='support' AND c.support_action_id IS NULL)
      OR (i.kind='control' AND NOT EXISTS(SELECT 1 FROM roomqc_control.control_commands WHERE id=c.control_command_id AND operation=i.operation))
      OR EXISTS(SELECT 1 FROM roomqc_control.support_attempt_closures WHERE intent_id=i.id AND generation=a.generation) THEN
      RAISE EXCEPTION 'SUPPORT_INTENT_RESULT_MISMATCH' USING ERRCODE='42501';END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_attempt_insert BEFORE INSERT ON roomqc_control.support_command_attempts
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_insert();
CREATE TRIGGER support_closure_insert BEFORE INSERT ON roomqc_control.support_attempt_closures
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_insert();
CREATE TRIGGER support_result_insert BEFORE INSERT ON roomqc_control.support_intent_results
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_support_journal_insert();

CREATE FUNCTION roomqc_control.fence_support_intent_acceptance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i roomqc_control.support_command_intents;a roomqc_control.support_command_attempts;
  command_operation text;command_kind text;
BEGIN
  IF NEW.control_command_id IS NOT NULL THEN
    command_kind:='control';SELECT operation INTO command_operation FROM roomqc_control.control_commands WHERE id=NEW.control_command_id;
  ELSIF NEW.recheck_command_id IS NOT NULL THEN command_kind:='recheck';command_operation:='recheck';
  ELSE command_kind:='support';command_operation:='reconcile';END IF;
  SELECT * INTO i FROM roomqc_control.support_command_intents WHERE kind=command_kind AND actor_id=NEW.actor_id
    AND operation=command_operation AND request_key=NEW.request_key
    AND (command_kind='control' OR (authority_cluster_id=NEW.authority_cluster_id AND target=NEW.target)) FOR UPDATE;
  -- Historical and not-yet-adopted families retain their old constraints.
  -- Once an intent exists, no old writer may consume an earlier round.
  IF NOT FOUND THEN RETURN NEW;END IF;
  SELECT * INTO a FROM roomqc_control.support_command_attempts WHERE intent_id=i.id ORDER BY generation DESC LIMIT 1;
  IF NOT FOUND OR ROW(NEW.authority_cluster_id,NEW.operation,NEW.target,NEW.payload_hash,NEW.session_id,NEW.attempt_id)
    IS DISTINCT FROM ROW(i.authority_cluster_id,i.acceptance_operation,i.target,i.payload_hash,a.session_id,a.attempt_id)
    OR EXISTS(SELECT 1 FROM roomqc_control.support_attempt_closures WHERE intent_id=i.id AND generation=a.generation) THEN
    RAISE EXCEPTION 'SUPPORT_INTENT_ATTEMPT_FENCED' USING ERRCODE='42501';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_intent_acceptance_fence BEFORE INSERT ON roomqc_control.support_command_acceptances
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.fence_support_intent_acceptance();

REVOKE ALL ON roomqc_control.support_command_intents,roomqc_control.support_command_attempts,
  roomqc_control.support_attempt_closures,roomqc_control.support_intent_results FROM PUBLIC;
GRANT SELECT,INSERT ON roomqc_control.support_command_intents,roomqc_control.support_command_attempts,
  roomqc_control.support_attempt_closures,roomqc_control.support_intent_results TO roomqc_control_api;
-- PostgreSQL row-locking SELECT requires UPDATE on at least one column.
-- The immutable BEFORE UPDATE trigger rejects even id=id; no history can be
-- rewritten. This narrow grant permits the common consumption/closure fence.
GRANT UPDATE(id) ON roomqc_control.support_command_intents TO roomqc_control_api;
REVOKE ALL ON FUNCTION roomqc_control.guard_support_journal_history(),roomqc_control.guard_support_journal_insert(),
  roomqc_control.fence_support_intent_acceptance() FROM PUBLIC;
