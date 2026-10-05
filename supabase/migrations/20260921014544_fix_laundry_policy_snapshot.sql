-- Keep laundry batch snapshots compatible with the current hotel_policy schema.
-- policy_value replaced the legacy value column in the live schema.
CREATE OR REPLACE FUNCTION public.trg_laundry_batch_snapshot_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
  v_scalar text;
BEGIN
  IF NEW.policy_snapshot IS NULL OR NEW.policy_snapshot = '{}'::jsonb THEN
    SELECT
      CASE
        WHEN jsonb_typeof(policy_value) = 'object'
          AND COALESCE(policy_value->>'days', '') ~ '^[0-9]+$'
          THEN policy_value->>'days'
        WHEN jsonb_typeof(policy_value) IN ('string', 'number')
          THEN trim(both '"' from policy_value::text)
        ELSE NULL
      END
    INTO v_scalar
    FROM public.hotel_policy
    WHERE tenant_id = NEW.tenant_id
      AND hotel_id = NEW.hotel_id
      AND policy_key = 'laundry_compensation_after_days'
      AND is_active = true
    LIMIT 1;

    IF COALESCE(v_scalar, '') ~ '^[0-9]+$' THEN
      v_days := v_scalar::integer;
    ELSE
      v_days := 30;
    END IF;

    NEW.policy_snapshot := jsonb_build_object(
      'compensation_after_days', v_days,
      'snapshot_at', now()
    );
  END IF;

  RETURN NEW;
END;
$$;
