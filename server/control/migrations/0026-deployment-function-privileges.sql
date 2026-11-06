-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. Trigger
-- helpers are invoked only by existing triggers, never directly by a worker.
-- Keep setup recovery's function allowlist valid after deployment migrations.
REVOKE ALL ON FUNCTION
  roomqc_control.guard_deployment_history(),
  roomqc_control.guard_deployment_spec(),
  roomqc_control.guard_deployment_job(),
  roomqc_control.guard_deployment_run_spec(),
  roomqc_control.guard_deployment_gate_insert(),
  roomqc_control.guard_deployment_phase_gate()
FROM PUBLIC;
