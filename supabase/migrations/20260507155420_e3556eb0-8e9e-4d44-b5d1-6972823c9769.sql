-- Fix FK violation: room_check_issue_outbox.issue_id references room_check_issues(id)
-- but BEFORE INSERT trigger fired before parent row existed.
-- Split into BEFORE (set charge_status only) + AFTER (fanout outbox).

DROP TRIGGER IF EXISTS trg_rci_outbox_fanout ON public.room_check_issues;
DROP TRIGGER IF EXISTS trg_enqueue_rci_jobs ON public.room_check_issues;
DROP FUNCTION IF EXISTS public.enqueue_room_check_issue_jobs() CASCADE;

CREATE OR REPLACE FUNCTION public.trg_rci_set_charge_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.charge_status = 'not_applicable' THEN
    IF NEW.charge_to_guest IS TRUE THEN
      NEW.charge_status := 'pending_fo_confirm';
    ELSIF NEW.needs_review IS TRUE THEN
      NEW.charge_status := 'pending_manager_review';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_room_check_issues_outbox_fanout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kinds text[] := ARRAY[]::text[];
  v_kind text;
  v_raw text;
  v_hash text;
  v_create_maint boolean;
  v_create_supp boolean;
BEGIN
  IF NEW.issue_role = 'derived_action' THEN
    RETURN NULL;
  END IF;

  IF NEW.needs_review = true AND NEW.bucket NOT IN ('items_sent_to_laundry') THEN
    RETURN NULL;
  END IF;

  v_create_maint := COALESCE((NEW.extra->>'create_maintenance')::boolean, false)
                    OR NEW.asset_group IN ('equipment_large','furniture','bathroom_hardware');
  v_create_supp  := COALESCE((NEW.extra->>'create_supplement')::boolean, false);

  CASE NEW.bucket
    WHEN 'items_sent_to_laundry' THEN
      v_kinds := ARRAY['laundry'];
    WHEN 'items_lost' THEN
      v_kinds := ARRAY['inventory_lost'];
      IF NEW.charge_to_guest IS TRUE THEN v_kinds := v_kinds || 'charge_guest'; END IF;
      IF v_create_supp THEN v_kinds := v_kinds || 'supplement_request'; END IF;
    WHEN 'items_damaged' THEN
      v_kinds := ARRAY['inventory_damaged'];
      IF v_create_maint THEN v_kinds := v_kinds || 'maintenance'; END IF;
    WHEN 'items_consumed' THEN
      v_kinds := ARRAY['inventory_consumed'];
      IF NEW.charge_to_guest IS TRUE THEN v_kinds := v_kinds || 'charge_guest'; END IF;
      IF v_create_supp THEN v_kinds := v_kinds || 'supplement_request'; END IF;
    WHEN 'items_replaced' THEN
      v_kinds := ARRAY['supplement_request'];
    ELSE
      v_kinds := ARRAY[]::text[];
  END CASE;

  FOREACH v_kind IN ARRAY v_kinds LOOP
    v_raw := NEW.tenant_id::text || ':' || NEW.id::text || ':' || v_kind;
    v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
    INSERT INTO public.room_check_issue_outbox(
      tenant_id, hotel_id, room_check_id, issue_id, job_kind, status,
      payload, schema_version, retry_count, next_retry_at,
      idempotency_key_raw, idempotency_key_hash
    ) VALUES (
      NEW.tenant_id, NEW.hotel_id, NEW.room_check_id, NEW.id, v_kind, 'pending',
      jsonb_build_object(
        'bucket', NEW.bucket, 'asset_group', NEW.asset_group,
        'item_id', NEW.item_id, 'quantity', NEW.quantity, 'extra', NEW.extra
      ),
      1, 0, now(), v_raw, v_hash
    )
    ON CONFLICT (issue_id, job_kind) DO NOTHING;
  END LOOP;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_rci_set_charge_status
BEFORE INSERT ON public.room_check_issues
FOR EACH ROW EXECUTE FUNCTION public.trg_rci_set_charge_status();

CREATE TRIGGER trg_rci_outbox_fanout
AFTER INSERT ON public.room_check_issues
FOR EACH ROW EXECUTE FUNCTION public.trg_room_check_issues_outbox_fanout();