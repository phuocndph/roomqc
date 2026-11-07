-- Immutable identity is persisted before any remote provisioning request.
-- This directory migration never changes a business/Supabase database.
CREATE TABLE roomqc_control.setup_dispatches (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES roomqc_control.workspaces(id),
  cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  owner_id uuid NOT NULL,
  routing_version integer NOT NULL CHECK (routing_version>0),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  terminal_state text CHECK (terminal_state IN ('closed','committed')),
  tenant_id uuid,hotel_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  settled_at timestamptz,
  UNIQUE(id,workspace_id,routing_version),
  CHECK ((terminal_state IS NULL)=(settled_at IS NULL)),
  CHECK (CASE WHEN terminal_state='committed' THEN tenant_id IS NOT NULL AND hotel_id IS NOT NULL
    ELSE tenant_id IS NULL AND hotel_id IS NULL END)
);
CREATE UNIQUE INDEX setup_dispatches_pending_idx ON roomqc_control.setup_dispatches(workspace_id) WHERE terminal_state IS NULL;
CREATE INDEX setup_dispatches_workspace_idx ON roomqc_control.setup_dispatches(workspace_id,created_at DESC,id DESC);
ALTER TABLE roomqc_control.provisioning_jobs ADD COLUMN dispatch_id uuid;
ALTER TABLE roomqc_control.provisioning_jobs ADD CONSTRAINT provisioning_jobs_dispatch_identity_fkey
  FOREIGN KEY(dispatch_id,workspace_id,expected_routing_version)
  REFERENCES roomqc_control.setup_dispatches(id,workspace_id,routing_version);
CREATE UNIQUE INDEX provisioning_jobs_dispatch_idx ON roomqc_control.provisioning_jobs(dispatch_id) WHERE dispatch_id IS NOT NULL;

CREATE FUNCTION roomqc_control.guard_setup_dispatch() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF ROW(NEW.id,NEW.workspace_id,NEW.cluster_id,NEW.owner_id,NEW.routing_version,NEW.payload_sha256,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.cluster_id,OLD.owner_id,OLD.routing_version,OLD.payload_sha256,OLD.created_at)
    OR (OLD.terminal_state IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'SETUP_DISPATCH_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION roomqc_control.guard_setup_dispatch() FROM PUBLIC;
CREATE TRIGGER setup_dispatch_immutable BEFORE UPDATE ON roomqc_control.setup_dispatches
  FOR EACH ROW EXECUTE FUNCTION roomqc_control.guard_setup_dispatch();
REVOKE ALL ON roomqc_control.setup_dispatches FROM PUBLIC;
GRANT SELECT,INSERT ON roomqc_control.setup_dispatches TO roomqc_control_api;
GRANT SELECT ON roomqc_control.setup_dispatches TO roomqc_control_worker;
GRANT UPDATE(terminal_state,tenant_id,hotel_id,settled_at) ON roomqc_control.setup_dispatches TO roomqc_control_api,roomqc_control_worker;
