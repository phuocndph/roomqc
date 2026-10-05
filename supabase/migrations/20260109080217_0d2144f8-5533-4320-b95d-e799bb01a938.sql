-- Create RPC to increment workflow stats
CREATE OR REPLACE FUNCTION public.increment_workflow_stats(
  p_workflow_id uuid,
  p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE workflows
  SET 
    total_executions = COALESCE(total_executions, 0) + 1,
    success_count = CASE WHEN p_success THEN COALESCE(success_count, 0) + 1 ELSE COALESCE(success_count, 0) END,
    failure_count = CASE WHEN NOT p_success THEN COALESCE(failure_count, 0) + 1 ELSE COALESCE(failure_count, 0) END,
    last_run_at = NOW()
  WHERE id = p_workflow_id;
END;
$$;