-- Frozen legacy baseline. Accept an empty DB or the validated, unversioned v2 directory.
CREATE TABLE IF NOT EXISTS roomqc_control.clusters (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,39}$'),
  api_url text NOT NULL,publishable_key text NOT NULL,vapid_public_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draining','offline')),
  max_workspaces integer NOT NULL CHECK (max_workspaces>0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version=1),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS roomqc_control.workspaces (
  id uuid PRIMARY KEY,slug text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{2,47}$' AND slug !~ '--' AND right(slug,1)<>'-'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),email_hash text NOT NULL,
  cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),tenant_id uuid,hotel_id uuid,owner_id uuid,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','provisioning','active','suspended','migrating','expired')),
  routing_version integer NOT NULL DEFAULT 1,last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,
  UNIQUE(cluster_id,tenant_id),UNIQUE(cluster_id,owner_id),
  CHECK (status<>'active' OR (tenant_id IS NOT NULL AND hotel_id IS NOT NULL AND owner_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS workspaces_cluster_idx ON roomqc_control.workspaces(cluster_id);
CREATE INDEX IF NOT EXISTS workspaces_slug_history_idx ON roomqc_control.workspaces(slug,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_live_slug_idx ON roomqc_control.workspaces(slug) WHERE status<>'expired';
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_live_email_idx ON roomqc_control.workspaces(email_hash) WHERE status<>'expired';
CREATE INDEX IF NOT EXISTS workspaces_expiry_idx ON roomqc_control.workspaces(expires_at) WHERE status='reserved' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspaces_created_idx ON roomqc_control.workspaces(created_at);
CREATE INDEX IF NOT EXISTS workspaces_email_created_idx ON roomqc_control.workspaces(email_hash,created_at);
CREATE TABLE IF NOT EXISTS roomqc_control.attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id uuid NOT NULL,
  workspace_id uuid REFERENCES roomqc_control.workspaces(id),outcome text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_workspace_idx ON roomqc_control.attempts(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_request_idx ON roomqc_control.attempts(request_id);
CREATE TABLE IF NOT EXISTS roomqc_control.support_actions (
  id uuid PRIMARY KEY,request_id uuid NOT NULL,workspace_id uuid NOT NULL REFERENCES roomqc_control.workspaces(id),
  actor_id uuid NOT NULL,authority_cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),outcome text NOT NULL DEFAULT 'started',
  before_state jsonb NOT NULL,after_state jsonb,error_code text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_actions_workspace_idx ON roomqc_control.support_actions(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_actions_request_idx ON roomqc_control.support_actions(request_id);
REVOKE ALL ON ALL TABLES IN SCHEMA roomqc_control FROM PUBLIC;
