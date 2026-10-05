
-- =====================================================
-- Sprint 2: Outbox fan-out + charge_status auto-set
-- =====================================================

CREATE OR REPLACE FUNCTION public.trg_room_check_issues_outbox_fanout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kinds text[] := ARRAY[]::text[];
  v_kind text;
  v_raw text;
  v_hash text;
  v_create_maint boolean;
BEGIN
  -- 1) Tự set charge_status nếu chưa set
  IF NEW.charge_status = 'not_applicable' THEN
    IF NEW.charge_to_guest IS TRUE THEN
      NEW.charge_status := 'pending_fo_confirm';
    ELSIF NEW.needs_review IS TRUE THEN
      NEW.charge_status := 'pending_manager_review';
    END IF;
  END IF;

  -- 2) Skip enqueue cho derived_action (đã link tới primary) — primary sẽ xử lý
  IF NEW.issue_role = 'derived_action' THEN
    RETURN NEW;
  END IF;

  -- 3) Skip nếu cần manager review trước (Sprint 3 sẽ enqueue khi approve)
  IF NEW.needs_review = true AND NEW.bucket NOT IN ('items_sent_to_laundry') THEN
    RETURN NEW;
  END IF;

  -- 4) Mapping bucket → job kinds
  v_create_maint := COALESCE((NEW.extra->>'create_maintenance')::boolean, false)
                    OR NEW.asset_group IN ('equipment_large','furniture','bathroom_hardware');

  CASE NEW.bucket
    WHEN 'items_sent_to_laundry' THEN
      v_kinds := ARRAY['laundry'];
    WHEN 'items_lost' THEN
      v_kinds := ARRAY['inventory_lost'];
      IF NEW.charge_to_guest IS TRUE THEN
        v_kinds := v_kinds || 'charge_guest';
      END IF;
    WHEN 'items_damaged' THEN
      v_kinds := ARRAY['inventory_damaged'];
      IF v_create_maint THEN
        v_kinds := v_kinds || 'maintenance';
      END IF;
    WHEN 'items_consumed' THEN
      v_kinds := ARRAY['inventory_consumed'];
      IF NEW.charge_to_guest IS TRUE THEN
        v_kinds := v_kinds || 'charge_guest';
      END IF;
    ELSE
      v_kinds := ARRAY[]::text[];
  END CASE;

  -- 5) Enqueue
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
        'bucket', NEW.bucket,
        'asset_group', NEW.asset_group,
        'item_id', NEW.item_id,
        'quantity', NEW.quantity,
        'extra', NEW.extra
      ),
      1, 0, now(),
      v_raw, v_hash
    )
    ON CONFLICT (issue_id, job_kind) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rci_outbox_fanout ON public.room_check_issues;
CREATE TRIGGER trg_rci_outbox_fanout
  BEFORE INSERT ON public.room_check_issues
  FOR EACH ROW EXECUTE FUNCTION public.trg_room_check_issues_outbox_fanout();
