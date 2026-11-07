ALTER TABLE roomqc_control.alerts ADD COLUMN origin text NOT NULL DEFAULT 'legacy' CHECK (origin IN ('legacy','health')),
  ADD COLUMN predecessor_id uuid REFERENCES roomqc_control.alerts(id);
CREATE TABLE roomqc_control.alert_events (
  id uuid PRIMARY KEY,alert_id uuid NOT NULL REFERENCES roomqc_control.alerts(id),
  resource_id text NOT NULL,cluster_id text REFERENCES roomqc_control.clusters(id),
  transition text NOT NULL CHECK (transition IN ('opened','acknowledged','resolved')),
  actor_id uuid,request_id uuid NOT NULL,command_id uuid REFERENCES roomqc_control.control_commands(id),
  health_generation bigint,alert_version bigint NOT NULL CHECK (alert_version>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX alert_events_version_idx ON roomqc_control.alert_events(alert_id,alert_version);
CREATE TABLE roomqc_control.alert_outbox (
  id uuid PRIMARY KEY,event_id uuid NOT NULL UNIQUE REFERENCES roomqc_control.alert_events(id),
  channel_ref text NOT NULL DEFAULT 'operations' CHECK (channel_ref='operations'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','retry','delivered','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),lease_token uuid,lease_until timestamptz,
  last_error_code text,delivered_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state='leased')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((state='delivered')=(delivered_at IS NOT NULL))
);
CREATE INDEX alert_outbox_due_idx ON roomqc_control.alert_outbox(next_attempt_at,id) WHERE state IN ('queued','retry');
CREATE INDEX alert_outbox_expired_idx ON roomqc_control.alert_outbox(lease_until,id) WHERE state='leased';
CREATE TABLE roomqc_control.alert_delivery_attempts (
  id uuid PRIMARY KEY,delivery_id uuid NOT NULL REFERENCES roomqc_control.alert_outbox(id),
  attempt integer NOT NULL CHECK (attempt>0),lease_token uuid NOT NULL UNIQUE,
  outcome text NOT NULL CHECK (outcome IN ('sending','delivered','retry','dead_letter','lease_expired')),
  error_code text,started_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,
  UNIQUE(delivery_id,attempt),CHECK ((outcome='sending')=(finished_at IS NULL))
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_alerts') THEN CREATE ROLE roomqc_control_alerts NOLOGIN; END IF;
END $$;
REVOKE ALL ON roomqc_control.alert_events,roomqc_control.alert_outbox,roomqc_control.alert_delivery_attempts FROM PUBLIC;
GRANT SELECT,INSERT ON roomqc_control.alert_events TO roomqc_control_api,roomqc_control_metrics;
GRANT INSERT ON roomqc_control.alert_outbox TO roomqc_control_api,roomqc_control_metrics;
REVOKE INSERT,UPDATE ON roomqc_control.alerts FROM roomqc_control_metrics;
GRANT INSERT(id,fingerprint,resource_id,type,severity,origin,predecessor_id) ON roomqc_control.alerts TO roomqc_control_metrics;
GRANT UPDATE(last_seen_at,resolved_at,row_version) ON roomqc_control.alerts TO roomqc_control_metrics;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_alerts;
GRANT SELECT ON roomqc_control.schema_migrations,roomqc_control.alert_outbox,roomqc_control.alert_delivery_attempts TO roomqc_control_alerts;
GRANT UPDATE(state,attempts,next_attempt_at,lease_token,lease_until,last_error_code,delivered_at) ON roomqc_control.alert_outbox TO roomqc_control_alerts;
GRANT INSERT ON roomqc_control.alert_delivery_attempts TO roomqc_control_alerts;
GRANT UPDATE(outcome,error_code,finished_at) ON roomqc_control.alert_delivery_attempts TO roomqc_control_alerts;
