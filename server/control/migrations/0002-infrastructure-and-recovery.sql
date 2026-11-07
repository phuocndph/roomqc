CREATE TABLE roomqc_control.hosts (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,63}$'),name text NOT NULL,
  region text,provider_label text,environment text NOT NULL CHECK (environment IN ('local','staging','production')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','retired')),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roomqc_control.clusters
  ADD COLUMN host_id text UNIQUE REFERENCES roomqc_control.hosts(id),
  ADD COLUMN backend_kind text NOT NULL DEFAULT 'self_hosted' CHECK (backend_kind IN ('self_hosted','managed')),
  ADD COLUMN credential_ref text,
  ADD COLUMN release_id text,ADD COLUMN schema_manifest_hash text,
  ADD COLUMN validation_state text NOT NULL DEFAULT 'pending' CHECK (validation_state IN ('pending','valid','invalid')),
  ADD COLUMN validated_at timestamptz,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),ADD COLUMN maintenance_reason text;
UPDATE roomqc_control.clusters SET credential_ref=id;
CREATE TABLE roomqc_control.cluster_policies (
  cluster_id text PRIMARY KEY REFERENCES roomqc_control.clusters(id),tenant_limit integer NOT NULL CHECK (tenant_limit>0),
  thresholds jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(thresholds)='object'),
  policy_schema_version integer NOT NULL DEFAULT 1 CHECK (policy_schema_version=1),
  reopen_mode text NOT NULL DEFAULT 'manual' CHECK (reopen_mode IN ('manual','automatic')),
  manual_closed boolean NOT NULL DEFAULT true,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO roomqc_control.cluster_policies(cluster_id,tenant_limit) SELECT id,max_workspaces FROM roomqc_control.clusters;
CREATE TABLE roomqc_control.cluster_health_current (
  cluster_id text PRIMARY KEY REFERENCES roomqc_control.clusters(id),source_generation bigint NOT NULL CHECK (source_generation>0),
  observed_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),valid_until timestamptz NOT NULL,
  metric_status text NOT NULL CHECK (metric_status IN ('healthy','degraded','unreachable','unknown')),
  normalized_values jsonb NOT NULL CHECK (jsonb_typeof(normalized_values)='object'),reason_codes text[] NOT NULL DEFAULT '{}',
  CHECK (valid_until>observed_at)
);
CREATE TABLE roomqc_control.cluster_admission_current (
  cluster_id text PRIMARY KEY REFERENCES roomqc_control.clusters(id),
  decision text NOT NULL CHECK (decision IN ('open','blocked','manual_closed')),reason_codes text[] NOT NULL DEFAULT '{}',
  health_generation bigint,policy_version bigint NOT NULL,evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roomqc_control.control_commands (
  id uuid PRIMARY KEY,actor_id uuid NOT NULL,authority_cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  operation text NOT NULL,target_id text NOT NULL,idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),expected_version bigint NOT NULL CHECK (expected_version>0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 1000),
  status text NOT NULL CHECK (status IN ('started','succeeded','failed')),result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
  UNIQUE(actor_id,operation,idempotency_key)
);
CREATE TABLE roomqc_control.cluster_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  type text NOT NULL,before_state jsonb,after_state jsonb,actor_id uuid,source text NOT NULL,request_id uuid,
  command_id uuid REFERENCES roomqc_control.control_commands(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cluster_events_cursor_idx ON roomqc_control.cluster_events(cluster_id,created_at DESC,id DESC);
CREATE TABLE roomqc_control.provisioning_jobs (
  id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES roomqc_control.workspaces(id),
  kind text NOT NULL DEFAULT 'receipt_reconcile' CHECK (kind='receipt_reconcile'),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','retry','waiting_owner','needs_review','succeeded','cancelled')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  lease_token uuid,lease_until timestamptz,expected_routing_version integer NOT NULL CHECK (expected_routing_version>0),
  last_error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state='leased')=(lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE UNIQUE INDEX provisioning_jobs_live_idx ON roomqc_control.provisioning_jobs(workspace_id,kind) WHERE state NOT IN ('succeeded','cancelled');
CREATE INDEX provisioning_jobs_claim_idx ON roomqc_control.provisioning_jobs(next_attempt_at,id) WHERE state IN ('queued','retry');
CREATE INDEX provisioning_jobs_lease_idx ON roomqc_control.provisioning_jobs(lease_until,id) WHERE state='leased';
CREATE TABLE roomqc_control.signup_affinities (
  email_hash text PRIMARY KEY,cluster_id text NOT NULL REFERENCES roomqc_control.clusters(id),
  policy_version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roomqc_control.signup_affinity_conflicts (
  email_hash text PRIMARY KEY,cluster_ids text[] NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(cluster_ids)>1)
);
INSERT INTO roomqc_control.signup_affinities(email_hash,cluster_id)
  SELECT email_hash,min(cluster_id) FROM roomqc_control.workspaces GROUP BY email_hash HAVING count(DISTINCT cluster_id)=1;
INSERT INTO roomqc_control.signup_affinity_conflicts(email_hash,cluster_ids)
  SELECT email_hash,array_agg(DISTINCT cluster_id ORDER BY cluster_id) FROM roomqc_control.workspaces GROUP BY email_hash HAVING count(DISTINCT cluster_id)>1;
CREATE TABLE roomqc_control.alerts (
  id uuid PRIMARY KEY,fingerprint text NOT NULL,resource_id text NOT NULL,type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),acknowledged_by uuid,acknowledged_at timestamptz,resolved_at timestamptz
);
CREATE UNIQUE INDEX alerts_open_fingerprint_idx ON roomqc_control.alerts(fingerprint) WHERE resolved_at IS NULL;
CREATE INDEX alerts_cursor_idx ON roomqc_control.alerts(opened_at DESC,id DESC);
CREATE TABLE roomqc_control.backup_runs (
  id uuid PRIMARY KEY,cluster_id text REFERENCES roomqc_control.clusters(id),scope text NOT NULL CHECK (scope IN ('directory','cluster','objects','bundle')),
  backup_id text NOT NULL,manifest_hash text NOT NULL,completed_at timestamptz,
  verification_state text NOT NULL CHECK (verification_state IN ('pending','verified','failed')),restore_test_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(scope,backup_id)
);
CREATE INDEX backup_runs_cluster_idx ON roomqc_control.backup_runs(cluster_id,completed_at DESC,id DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA roomqc_control FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA roomqc_control FROM PUBLIC;
