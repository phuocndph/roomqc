ALTER TABLE roomqc_control.clusters ADD COLUMN inventory_ref text,
  ADD COLUMN frontend_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN validation_manifest jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(validation_manifest)='object');
UPDATE roomqc_control.clusters SET inventory_ref=id;
ALTER TABLE roomqc_control.cluster_policies ADD COLUMN operator_reopen_required boolean NOT NULL DEFAULT true;
ALTER TABLE roomqc_control.cluster_health_current ADD COLUMN evaluator_state jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(evaluator_state)='object');
ALTER TABLE roomqc_control.alerts ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version>0);
ALTER TABLE roomqc_control.workspaces ADD COLUMN admission_policy_version bigint,ADD COLUMN admission_health_generation bigint;
CREATE SEQUENCE roomqc_control.health_generation_seq AS bigint;
GRANT USAGE ON SEQUENCE roomqc_control.health_generation_seq TO roomqc_control_metrics;
GRANT UPDATE(operator_reopen_required) ON roomqc_control.cluster_policies TO roomqc_control_metrics;
GRANT UPDATE(acknowledged_by,acknowledged_at,row_version) ON roomqc_control.alerts TO roomqc_control_api;
REVOKE UPDATE ON roomqc_control.support_actions FROM roomqc_control_api;
GRANT UPDATE(outcome,after_state,error_code,finished_at) ON roomqc_control.support_actions TO roomqc_control_api;
CREATE INDEX workspaces_admin_cursor_idx ON roomqc_control.workspaces(created_at DESC,id DESC);
CREATE INDEX workspaces_admin_status_idx ON roomqc_control.workspaces(status,created_at DESC,id DESC);
CREATE INDEX workspaces_admin_cluster_idx ON roomqc_control.workspaces(cluster_id,created_at DESC,id DESC);
