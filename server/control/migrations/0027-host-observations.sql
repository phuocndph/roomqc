-- Host monitoring is independent of cluster enrollment and signup admission.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='roomqc_control_host_observer') THEN
    CREATE ROLE roomqc_control_host_observer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
CREATE TABLE roomqc_control.host_resources_current (
  host_id text PRIMARY KEY REFERENCES roomqc_control.hosts(id),
  target_fingerprint text NOT NULL CHECK(target_fingerprint ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cpu_count integer NOT NULL CHECK(cpu_count BETWEEN 1 AND 4096),
  cpu_usage_percent numeric(5,2) NOT NULL CHECK(cpu_usage_percent BETWEEN 0 AND 100),
  memory_total_bytes bigint NOT NULL CHECK(memory_total_bytes>0),
  memory_available_bytes bigint NOT NULL CHECK(memory_available_bytes BETWEEN 0 AND memory_total_bytes),
  disk_total_bytes bigint NOT NULL CHECK(disk_total_bytes>0),
  disk_used_bytes bigint NOT NULL CHECK(disk_used_bytes BETWEEN 0 AND disk_total_bytes),
  disk_available_bytes bigint NOT NULL CHECK(disk_available_bytes BETWEEN 0 AND disk_total_bytes),
  docker_server_version text CHECK(length(docker_server_version) BETWEEN 1 AND 80),
  source text NOT NULL DEFAULT 'ssh_readonly' CHECK(source='ssh_readonly')
);
REVOKE ALL ON roomqc_control.host_resources_current FROM PUBLIC;
GRANT USAGE ON SCHEMA roomqc_control TO roomqc_control_host_observer;
GRANT SELECT ON roomqc_control.hosts TO roomqc_control_host_observer;
GRANT INSERT(id,name,region,provider_label,environment) ON roomqc_control.hosts TO roomqc_control_host_observer;
GRANT SELECT,INSERT,UPDATE ON roomqc_control.host_resources_current TO roomqc_control_host_observer;
GRANT SELECT ON roomqc_control.host_resources_current TO roomqc_control_api;
