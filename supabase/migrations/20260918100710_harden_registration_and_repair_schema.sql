-- RoomQC hardening and schema compatibility fixes.
-- This migration intentionally overrides broken historical functions instead
-- of rewriting the migration history.

-- Keep the current schema compatible with functions that were introduced by
-- later feature migrations.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.consumption_snapshots
  ADD COLUMN IF NOT EXISTS window_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.tenants
SET next_billing_date = COALESCE(next_billing_date, subscription_current_period_end)
WHERE next_billing_date IS NULL;

UPDATE public.room_items
SET updated_at = COALESCE(updated_at, last_checked_at, assigned_at, now())
WHERE updated_at IS NULL;

UPDATE public.warehouse_stock
SET updated_at = COALESCE(updated_at, last_updated, created_at, now())
WHERE updated_at IS NULL;

-- Historical callers use a zero-argument helper. Keep the UUID version as the
-- source of truth and make the wrapper follow the current JWT subject.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin(auth.uid());
$$;

-- Final compatibility pass for functions that were created before the schema
-- was consolidated.  The historical definitions are retained, but their
-- executable bodies are rewritten here so a fresh database has one coherent
-- contract without changing old migration files.

DO $repair_submit$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.submit_room_check_lean(uuid,text,timestamp with time zone,text,text[],jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'submit_room_check_lean definition is missing';
  END IF;
  v_definition := replace(v_definition, 'public.tasks', 'public.housekeeping_tasks');
  EXECUTE v_definition;
END;
$repair_submit$;

DO $repair_outbox$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.process_room_check_issue_outbox(integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'process_room_check_issue_outbox definition is missing';
  END IF;
  v_definition := replace(
    v_definition,
    'SELECT item_code, unit_price INTO v_item_code, v_unit_price FROM public.items',
    'SELECT code, unit_price INTO v_item_code, v_unit_price FROM public.items'
  );
  v_definition := replace(
    v_definition,
    'SELECT unit_price, item_code INTO v_unit_price, v_item_code FROM public.items',
    'SELECT unit_price, code INTO v_unit_price, v_item_code FROM public.items'
  );
  v_definition := replace(
    v_definition,
    'ORDER BY check_in_time DESC NULLS LAST',
    'ORDER BY COALESCE(actual_check_in, check_in_date::timestamptz) DESC NULLS LAST'
  );
  EXECUTE v_definition;
END;
$repair_outbox$;

DO $repair_issue_arrays$
DECLARE
  v_name text;
  v_definition text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.trg_room_check_issues_outbox_fanout()',
    'public.review_room_check_issue(uuid,text,text)'
  ] LOOP
    SELECT pg_get_functiondef(v_name::regprocedure) INTO v_definition;
    IF v_definition IS NULL THEN
      RAISE EXCEPTION 'Missing room-check function: %', v_name;
    END IF;
    v_definition := replace(v_definition, $$v_kinds := v_kinds || 'charge_guest'$$,
      $$v_kinds := v_kinds || ARRAY['charge_guest']$$);
    v_definition := replace(v_definition, $$v_kinds := v_kinds || 'supplement_request'$$,
      $$v_kinds := v_kinds || ARRAY['supplement_request']$$);
    v_definition := replace(v_definition, $$v_kinds := v_kinds || 'maintenance'$$,
      $$v_kinds := v_kinds || ARRAY['maintenance']$$);
    EXECUTE v_definition;
  END LOOP;
END;
$repair_issue_arrays$;

DO $repair_booking_casts$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.create_booking_v2(jsonb,jsonb)'::regprocedure)
  INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'create_booking_v2 definition is missing';
  END IF;
  v_definition := replace(v_definition, $$v_booking ->> 'expected_check_in_time'$$,
    $$NULLIF(v_booking ->> 'expected_check_in_time', '')::time$$);
  v_definition := replace(v_definition, $$v_booking ->> 'expected_check_out_time'$$,
    $$NULLIF(v_booking ->> 'expected_check_out_time', '')::time$$);
  EXECUTE v_definition;
END;
$repair_booking_casts$;

-- The current schema has no booking_guests table.  Keep these RPCs focused on
-- the canonical guest_id column and avoid a dead static reference that makes
-- schema lint fail even when the optional table is absent.
CREATE OR REPLACE FUNCTION public.enqueue_stay_registration(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $enqueue$
DECLARE
  v_user_tenant uuid;
  v_booking record;
  v_room_number text;
  v_count integer := 0;
BEGIN
  SELECT u.tenant_id INTO v_user_tenant
  FROM public.users u
  WHERE u.id = auth.uid();

  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_user_tenant IS NULL OR v_user_tenant <> v_booking.tenant_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF v_booking.guest_id IS NULL THEN
    RETURN 0;
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');
  INSERT INTO public.guest_stay_registrations(
    tenant_id, hotel_id, booking_id, guest_id, room_number,
    check_in_at, check_out_at, status
  ) VALUES (
    v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
    v_room_number,
    COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
    COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
    'pending'
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$enqueue$;

CREATE OR REPLACE FUNCTION public._enqueue_stay_registration_internal(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $enqueue_internal$
DECLARE
  v_booking record;
  v_room_number text;
  v_count integer := 0;
BEGIN
  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND OR v_booking.guest_id IS NULL THEN
    RETURN 0;
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');
  INSERT INTO public.guest_stay_registrations(
    tenant_id, hotel_id, booking_id, guest_id, room_number,
    check_in_at, check_out_at, status
  ) VALUES (
    v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
    v_room_number,
    COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
    COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
    'pending'
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$enqueue_internal$;

CREATE OR REPLACE FUNCTION public.get_pending_tenants()
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  owner_name text,
  owner_email text,
  created_at timestamptz,
  subscription_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $pending$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only Super Admin can view pending tenants';
  END IF;

  RETURN QUERY
  SELECT t.id,
         t.name,
         u.full_name,
         u.email,
         t.created_at,
         COALESCE(t.subscription_plan, sp.code, '')::text
  FROM public.tenants t
  JOIN public.users u
    ON u.tenant_id = t.id
   AND u.user_level_code = 'tenant_owner'
  LEFT JOIN public.subscription_plans sp ON sp.id = t.subscription_plan_id
  WHERE t.approval_status = 'pending'
  ORDER BY t.created_at DESC;
END;
$pending$;

CREATE OR REPLACE FUNCTION public.handle_successful_payment(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $payment$
DECLARE
  v_transaction public.payment_transactions%ROWTYPE;
  v_new_period_end timestamptz;
  v_invoice_id uuid;
  v_owner_id uuid;
  v_owner_email text;
  v_plan_name text;
  v_plan_code text;
  v_invoice_number text;
BEGIN
  SELECT pt.* INTO v_transaction
  FROM public.payment_transactions pt
  WHERE pt.id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  IF v_transaction.plan_id IS NULL OR v_transaction.billing_cycle IS NULL THEN
    RAISE EXCEPTION 'Transaction is missing plan or billing cycle: %', p_transaction_id;
  END IF;

  v_new_period_end := CASE v_transaction.billing_cycle
    WHEN 'monthly' THEN now() + interval '1 month'
    WHEN 'yearly' THEN now() + interval '1 year'
    ELSE NULL
  END;
  IF v_new_period_end IS NULL THEN
    RAISE EXCEPTION 'Invalid billing cycle: %', v_transaction.billing_cycle;
  END IF;

  SELECT sp.name, sp.code INTO v_plan_name, v_plan_code
  FROM public.subscription_plans sp
  WHERE sp.id = v_transaction.plan_id;

  UPDATE public.tenants t
  SET subscription_status = 'active',
      subscription_plan = COALESCE(v_plan_code, t.subscription_plan),
      subscription_plan_id = v_transaction.plan_id,
      subscription_current_period_start = now(),
      subscription_current_period_end = v_new_period_end,
      next_billing_date = v_new_period_end,
      grace_period_ends_at = NULL,
      billing_cycle = v_transaction.billing_cycle,
      updated_at = now()
  WHERE t.id = v_transaction.tenant_id;

  IF v_transaction.invoice_id IS NULL THEN
    SELECT u.id, u.email INTO v_owner_id, v_owner_email
    FROM public.users u
    WHERE u.tenant_id = v_transaction.tenant_id
      AND u.user_level_code = 'tenant_owner'
      AND u.deleted_at IS NULL
    ORDER BY u.created_at
    LIMIT 1;

    v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-'
      || upper(substr(replace(v_transaction.id::text, '-', ''), 1, 12));

    INSERT INTO public.invoices(
      tenant_id, invoice_number, invoice_date, due_date,
      period_start, period_end, subscription_plan_id,
      subtotal, tax_amount, discount_amount, total_amount,
      status, paid_at, items, notes, created_by
    ) VALUES (
      v_transaction.tenant_id, v_invoice_number, current_date, current_date,
      current_date, (v_new_period_end::date - 1), v_transaction.plan_id,
      v_transaction.amount, 0, 0, v_transaction.amount,
      'paid', now(),
      jsonb_build_array(jsonb_build_object(
        'description', COALESCE(v_plan_name, 'Subscription') || ' - ' || v_transaction.billing_cycle,
        'amount', v_transaction.amount,
        'transaction_id', v_transaction.id
      )),
      'Generated from successful payment', v_owner_id
    )
    ON CONFLICT (invoice_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_invoice_id;

    UPDATE public.payment_transactions pt
    SET invoice_id = v_invoice_id,
        payment_status = 'completed',
        payment_date = COALESCE(pt.payment_date, now()),
        updated_at = now()
    WHERE pt.id = p_transaction_id;

    IF v_owner_email IS NOT NULL THEN
      BEGIN
        PERFORM public.queue_email_notification(
          v_transaction.tenant_id, v_owner_id, v_owner_email,
          'Payment Successful - Subscription Renewed',
          '<h2>Payment Successful</h2><p>Your subscription has been renewed successfully.</p>',
          'payment_successful',
          jsonb_build_object('amount', v_transaction.amount, 'next_billing_date', v_new_period_end)
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'payment email enqueue failed: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$payment$;

-- DB-to-function notification dispatch is opt-in.  Configure the URL via
-- app.settings.supabase_url (or roomqc_public_url) and the secret in Vault;
-- otherwise the trigger only updates the conversation row and exits safely.
CREATE OR REPLACE FUNCTION public.chat_after_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $chat$
DECLARE
  v_base_url text;
  v_internal_secret text;
  v_url text;
  v_hotel_id uuid;
  v_has_attachment boolean;
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(COALESCE(NEW.body, '[đính kèm]'), 200),
      last_sender_id = NEW.sender_id,
      updated_at = now()
  WHERE id = NEW.conversation_id
  RETURNING hotel_id INTO v_hotel_id;

  v_base_url := COALESCE(
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    NULLIF(current_setting('app.settings.roomqc_public_url', true), '')
  );
  SELECT ds.decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ROOMQC_INTERNAL_FUNCTION_SECRET'
  LIMIT 1;
  IF v_base_url IS NULL OR v_internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  v_url := rtrim(v_base_url, '/') || '/functions/v1/notify-new-message';
  SELECT EXISTS(
    SELECT 1 FROM public.message_attachments WHERE message_id = NEW.id
  ) INTO v_has_attachment;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_internal_secret
      ),
      body := jsonb_build_object(
        'message_id', NEW.id,
        'conversation_id', NEW.conversation_id,
        'tenant_id', NEW.tenant_id,
        'hotel_id', v_hotel_id,
        'sender_id', NEW.sender_id,
        'body', NEW.body,
        'has_attachment', COALESCE(v_has_attachment, false)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify-new-message dispatch failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$chat$;

REVOKE ALL ON FUNCTION public.handle_successful_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_successful_payment(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_pending_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_tenants() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enqueue_stay_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_stay_registration(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._enqueue_stay_registration_internal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._enqueue_stay_registration_internal(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.submit_room_check_lean(uuid,text,timestamp with time zone,text,text[],jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_room_check_lean(uuid,text,timestamp with time zone,text,text[],jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_room_check_issue_outbox(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_room_check_issue_outbox(integer) TO service_role;
REVOKE ALL ON FUNCTION public.chat_after_message_insert() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- Compatibility overloads for older audit callers. The canonical function is
-- the nine-argument version created by the audit migration.
CREATE OR REPLACE FUNCTION public.log_state_transition(
  p_table_name text,
  p_record_id uuid,
  p_action text,
  p_context jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
BEGIN
  SELECT u.tenant_id, u.hotel_id
  INTO v_tenant_id, v_hotel_id
  FROM public.users u
  WHERE u.id = auth.uid();

  IF p_table_name = 'purchase_order' THEN
    SELECT po.tenant_id, po.hotel_id
    INTO v_tenant_id, v_hotel_id
    FROM public.purchase_orders po
    WHERE po.id = p_record_id;
  ELSIF p_table_name = 'booking' THEN
    SELECT b.tenant_id, b.hotel_id
    INTO v_tenant_id, v_hotel_id
    FROM public.room_bookings b
    WHERE b.id = p_record_id;
  END IF;

  RETURN public.log_state_transition(
    v_tenant_id, v_hotel_id, p_table_name, p_record_id,
    COALESCE(p_action, 'state_change'), NULL, NULL, NULL,
    COALESCE(p_context, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_state_transition(
  p_table_name text,
  p_record_id uuid,
  p_from_state text,
  p_to_state text,
  p_context jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_hotel_id uuid;
BEGIN
  SELECT u.tenant_id, u.hotel_id
  INTO v_tenant_id, v_hotel_id
  FROM public.users u
  WHERE u.id = auth.uid();

  IF p_table_name = 'purchase_order' THEN
    SELECT po.tenant_id, po.hotel_id
    INTO v_tenant_id, v_hotel_id
    FROM public.purchase_orders po
    WHERE po.id = p_record_id;
  ELSIF p_table_name = 'booking' THEN
    SELECT b.tenant_id, b.hotel_id
    INTO v_tenant_id, v_hotel_id
    FROM public.room_bookings b
    WHERE b.id = p_record_id;
  END IF;

  RETURN public.log_state_transition(
    v_tenant_id, v_hotel_id, p_table_name, p_record_id,
    'state_change', p_from_state, p_to_state, NULL,
    COALESCE(p_context, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_state_transition(text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_state_transition(text, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_state_transition(text, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_state_transition(text, uuid, text, text, jsonb) TO authenticated, service_role;

-- New auth users start unprovisioned. The registration RPC is the only path
-- that can attach a tenant, hotel, owner role, and business defaults.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'created_by_admin', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (
    id, email, full_name, role, status, user_level_code,
    is_primary_owner, login_count, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Chủ sở hữu'),
    'owner',
    'pending_setup',
    NULL,
    false,
    0,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates an unprovisioned profile; complete_registration performs tenant onboarding.';

-- Complete the first registration atomically. Only the current auth subject
-- (or a trusted service-role call) may use this RPC. A completed owner retry
-- is read-only and returns the existing tenant/hotel instead of mutating it.
CREATE OR REPLACE FUNCTION public.complete_registration(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_tenant_name text,
  p_email text,
  p_hotel_name text,
  p_hotel_address text,
  p_hotel_phone text,
  p_hotel_email text,
  p_total_rooms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile public.users%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_plan_id uuid;
  v_hotel_code text;
  v_auth_email text;
  v_profile_exists boolean := false;
  v_is_service_role boolean :=
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_existing_owner boolean;
BEGIN
  IF p_user_id IS NULL OR (
    auth.uid() IS DISTINCT FROM p_user_id AND NOT v_is_service_role
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT lower(trim(au.email))
  INTO v_auth_email
  FROM auth.users au
  WHERE au.id = p_user_id;

  IF v_auth_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF NULLIF(trim(p_email), '') IS NULL
     OR lower(trim(p_email)) <> v_auth_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration email does not match the authenticated account');
  END IF;

  IF NULLIF(trim(p_full_name), '') IS NULL
     OR NULLIF(trim(p_tenant_name), '') IS NULL
     OR NULLIF(trim(p_hotel_name), '') IS NULL
     OR p_total_rooms IS NULL OR p_total_rooms < 1 OR p_total_rooms > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Required registration fields are invalid');
  END IF;

  SELECT * INTO v_profile
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  v_profile_exists := FOUND;

  IF v_profile_exists THEN
    IF COALESCE(v_profile.is_super_admin, false)
       OR v_profile.user_level_code = 'super_admin' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Super admin accounts cannot use tenant registration');
    END IF;

    IF v_profile.user_level_code IN ('manager', 'staff') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Staff accounts cannot create a tenant');
    END IF;

    -- A legitimate retry after a successful onboarding is idempotent and does
    -- not accept new tenant/hotel values from the client.
    IF v_profile.status = 'active'
       AND v_profile.user_level_code = 'tenant_owner'
       AND COALESCE(v_profile.is_primary_owner, false)
       AND v_profile.tenant_id IS NOT NULL THEN
      SELECT t.id, h.id
      INTO v_tenant_id, v_hotel_id
      FROM public.tenants t
      LEFT JOIN public.hotels h ON h.id = v_profile.hotel_id AND h.tenant_id = t.id
      WHERE t.id = v_profile.tenant_id
        AND lower(t.email) = v_auth_email;

      IF v_tenant_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'tenant_id', v_tenant_id,
          'hotel_id', v_hotel_id,
          'idempotent', true
        );
      END IF;

      RETURN jsonb_build_object('success', false, 'error', 'The account is already provisioned');
    END IF;

    IF v_profile.tenant_id IS NOT NULL
       AND COALESCE(v_profile.status, '') NOT IN ('pending_setup', '') THEN
      RETURN jsonb_build_object('success', false, 'error', 'The account is already provisioned');
    END IF;
  END IF;

  -- Select the current plan without relying on the retired legacy `basic`
  -- plan. The fallbacks keep older restored databases usable.
  SELECT sp.id INTO v_plan_id
  FROM public.subscription_plans sp
  WHERE sp.is_active = true
    AND sp.code IN ('free_trial', 'basic', 'standard')
  ORDER BY CASE sp.code
    WHEN 'free_trial' THEN 1
    WHEN 'basic' THEN 2
    WHEN 'standard' THEN 3
    ELSE 99
  END
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active subscription plan found');
  END IF;

  -- Reuse a pending profile's tenant only when it belongs to this auth email.
  IF v_profile.tenant_id IS NOT NULL THEN
    SELECT * INTO v_tenant
    FROM public.tenants t
    WHERE t.id = v_profile.tenant_id
    FOR UPDATE;

    IF NOT FOUND OR lower(v_tenant.email) <> v_auth_email THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tenant ownership could not be verified');
    END IF;

    v_tenant_id := v_tenant.id;
  ELSE
    -- A tenant with this email may only be reused if it has no provisioned
    -- owner/staff accounts. Otherwise this is a duplicate registration.
    SELECT * INTO v_tenant
    FROM public.tenants t
    WHERE lower(t.email) = v_auth_email
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.tenant_id = v_tenant.id
          AND u.id <> p_user_id
          AND (
            u.status IN ('active', 'inactive')
            OR u.user_level_code IS NOT NULL
          )
      ) INTO v_existing_owner;

      IF v_existing_owner THEN
        RETURN jsonb_build_object('success', false, 'error', 'A tenant already uses this email');
      END IF;

      v_tenant_id := v_tenant.id;
    END IF;
  END IF;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (
      name, email, phone, subscription_plan, subscription_plan_id,
      subscription_status, trial_ends_at, subscription_start_date,
      subscription_end_date, trial_end_date, billing_cycle,
      approval_status, approved_at, next_billing_date
    ) VALUES (
      trim(p_tenant_name), v_auth_email, NULLIF(trim(p_phone), ''),
      'free_trial', v_plan_id, 'trial', now() + interval '30 days',
      current_date, current_date + 30, current_date + 30, 'monthly',
      'approved', now(), now() + interval '30 days'
    )
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants t
    SET name = trim(p_tenant_name),
        email = v_auth_email,
        phone = COALESCE(NULLIF(trim(p_phone), ''), t.phone),
        subscription_plan = COALESCE(NULLIF(t.subscription_plan, ''), 'free_trial'),
        subscription_plan_id = COALESCE(t.subscription_plan_id, v_plan_id),
        subscription_status = COALESCE(NULLIF(t.subscription_status, ''), 'trial'),
        trial_ends_at = COALESCE(t.trial_ends_at, now() + interval '30 days'),
        subscription_start_date = COALESCE(t.subscription_start_date, current_date),
        subscription_end_date = COALESCE(t.subscription_end_date, current_date + 30),
        trial_end_date = COALESCE(t.trial_end_date, current_date + 30),
        next_billing_date = COALESCE(t.next_billing_date, now() + interval '30 days'),
        billing_cycle = COALESCE(t.billing_cycle, 'monthly'),
        approval_status = 'approved',
        approved_at = COALESCE(t.approved_at, now()),
        rejection_reason = NULL,
        updated_at = now()
    WHERE t.id = v_tenant_id;
  END IF;

  -- Reuse a pending profile's hotel when one exists; otherwise create one.
  IF v_profile.hotel_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.hotels h
       WHERE h.id = v_profile.hotel_id AND h.tenant_id = v_tenant_id
     ) THEN
    v_hotel_id := v_profile.hotel_id;
  ELSE
    SELECT h.id INTO v_hotel_id
    FROM public.hotels h
    WHERE h.tenant_id = v_tenant_id
    ORDER BY h.created_at NULLS FIRST, h.id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_hotel_id IS NULL THEN
    LOOP
      v_hotel_code := 'HTL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.hotels h WHERE h.code = v_hotel_code);
    END LOOP;

    INSERT INTO public.hotels (
      tenant_id, code, name, address, phone, email, total_rooms,
      type, country, status
    ) VALUES (
      v_tenant_id, v_hotel_code, trim(p_hotel_name),
      NULLIF(trim(p_hotel_address), ''), NULLIF(trim(p_hotel_phone), ''),
      NULLIF(trim(p_hotel_email), ''), p_total_rooms,
      'hotel', 'VN', 'active'
    )
    RETURNING id INTO v_hotel_id;
  ELSE
    UPDATE public.hotels h
    SET name = trim(p_hotel_name),
        address = COALESCE(NULLIF(trim(p_hotel_address), ''), h.address),
        phone = COALESCE(NULLIF(trim(p_hotel_phone), ''), h.phone),
        email = COALESCE(NULLIF(trim(p_hotel_email), ''), h.email),
        total_rooms = p_total_rooms,
        status = 'active',
        updated_at = now()
    WHERE h.id = v_hotel_id;
  END IF;

  IF v_profile_exists THEN
    UPDATE public.users u
    SET tenant_id = v_tenant_id,
        hotel_id = v_hotel_id,
        email = v_auth_email,
        phone = COALESCE(NULLIF(trim(p_phone), ''), u.phone),
        full_name = COALESCE(NULLIF(trim(p_full_name), ''), u.full_name),
        role = 'owner',
        user_level_code = 'tenant_owner',
        is_primary_owner = true,
        status = 'active',
        phone_verified = COALESCE(u.phone_verified, false),
        updated_at = now()
    WHERE u.id = p_user_id;
  ELSE
    INSERT INTO public.users (
      id, tenant_id, hotel_id, email, phone, full_name,
      role, user_level_code, is_primary_owner, status, login_count,
      phone_verified, created_at, updated_at
    ) VALUES (
      p_user_id, v_tenant_id, v_hotel_id, v_auth_email,
      NULLIF(trim(p_phone), ''), trim(p_full_name),
      'owner', 'tenant_owner', true, 'active', 0,
      false, now(), now()
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'owner')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_hotels (
    user_id, hotel_id, assigned_by, can_create_managers, can_create_staff,
    can_view_reports, can_export_data, can_approve_requests
  ) VALUES (
    p_user_id, v_hotel_id, p_user_id, true, true, true, true, true
  )
  ON CONFLICT (user_id, hotel_id) DO UPDATE SET
    assigned_by = EXCLUDED.assigned_by,
    can_create_managers = EXCLUDED.can_create_managers,
    can_create_staff = EXCLUDED.can_create_staff,
    can_view_reports = EXCLUDED.can_view_reports,
    can_export_data = EXCLUDED.can_export_data,
    can_approve_requests = EXCLUDED.can_approve_requests;

  INSERT INTO public.tenant_usage (
    tenant_id, current_hotels_count, current_users_count,
    current_rooms_count, current_items_count, current_storage_bytes
  ) VALUES (v_tenant_id, 1, 1, 0, 0, 0)
  ON CONFLICT (tenant_id) DO UPDATE SET
    current_hotels_count = GREATEST(COALESCE(public.tenant_usage.current_hotels_count, 0), 1),
    current_users_count = GREATEST(COALESCE(public.tenant_usage.current_users_count, 0), 1),
    updated_at = now();

  -- Seed reference data once per tenant. All inserts are retry-safe.
  INSERT INTO public.item_categories (tenant_id, name, name_en, description, icon, color, sort_order, status)
  SELECT v_tenant_id, d.name, d.name_en, d.description, d.icon, d.color, d.sort_order, 'active'
  FROM (VALUES
    ('Đồ vải', 'Fabric & Linens', 'Khăn tắm, ga giường, chăn gối...', 'shirt', '#3b82f6', 1),
    ('Tiện nghi', 'Amenities', 'Bàn chải, dầu gội, sữa tắm...', 'sparkles', '#8b5cf6', 2),
    ('Thiết bị điện', 'Electronics', 'Tivi, tủ lạnh, máy sấy...', 'tv', '#10b981', 3),
    ('Nội thất', 'Furniture', 'Giường, tủ, bàn, ghế...', 'sofa', '#f59e0b', 4),
    ('Đồ dùng khác', 'Other Items', 'Các vật dụng khác...', 'package', '#6b7280', 5)
  ) AS d(name, name_en, description, icon, color, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.item_categories c
    WHERE c.tenant_id = v_tenant_id AND c.name = d.name
  );

  INSERT INTO public.laundry_categories (
    tenant_id, name, code, description, price_per_kg, price_per_item, status
  ) VALUES
    (v_tenant_id, 'Giặt thông thường', 'STANDARD', 'Giặt sấy thông thường', 15000, 5000, 'active'),
    (v_tenant_id, 'Giặt khô', 'DRY_CLEAN', 'Giặt khô chuyên nghiệp', 30000, 15000, 'active'),
    (v_tenant_id, 'Giặt hấp', 'STEAM', 'Giặt và là hấp', 20000, 8000, 'active')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO public.maintenance_categories (
    tenant_id, name, code, description, icon, color, status
  ) VALUES
    (v_tenant_id, 'Điện', 'ELECTRIC', 'Sửa chữa hệ thống điện', 'zap', '#eab308', 'active'),
    (v_tenant_id, 'Nước', 'PLUMBING', 'Sửa chữa hệ thống nước', 'droplet', '#3b82f6', 'active'),
    (v_tenant_id, 'Điều hòa', 'HVAC', 'Sửa chữa điều hòa nhiệt độ', 'wind', '#06b6d4', 'active'),
    (v_tenant_id, 'Nội thất', 'FURNITURE', 'Sửa chữa nội thất', 'hammer', '#f59e0b', 'active'),
    (v_tenant_id, 'Khác', 'OTHER', 'Bảo trì khác', 'wrench', '#6b7280', 'active')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  INSERT INTO public.room_types (tenant_id, hotel_id, name, code, description, base_price, status)
  VALUES
    (v_tenant_id, v_hotel_id, 'Phòng Standard', 'STD', 'Phòng tiêu chuẩn', 500000, 'active'),
    (v_tenant_id, v_hotel_id, 'Phòng Superior', 'SUP', 'Phòng cao cấp', 700000, 'active'),
    (v_tenant_id, v_hotel_id, 'Phòng Deluxe', 'DLX', 'Phòng sang trọng', 1000000, 'active'),
    (v_tenant_id, v_hotel_id, 'Phòng Suite', 'SUI', 'Phòng hạng thương gia', 1500000, 'active')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  UPDATE public.room_types
  SET hotel_id = v_hotel_id
  WHERE tenant_id = v_tenant_id AND hotel_id IS NULL;

  INSERT INTO public.in_app_notifications (
    tenant_id, user_id, title, body, type, icon, is_read, metadata
  )
  SELECT v_tenant_id, p_user_id,
    'Chào mừng bạn đến với RoomQC!',
    'Tài khoản và khách sạn của bạn đã sẵn sàng.',
    'welcome', 'sparkles', false,
    jsonb_build_object('action', 'getting_started')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.in_app_notifications n
    WHERE n.user_id = p_user_id AND n.type = 'welcome'
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'hotel_id', v_hotel_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_registration(
  uuid, text, text, text, text, text, text, text, text, integer
) IS 'Completes first registration only for the authenticated unprovisioned account; retries are idempotent.';

-- Remove references to the old `failure_count` column; the live schema uses
-- `failed_count`.
CREATE OR REPLACE FUNCTION public.increment_workflow_stats(
  p_workflow_id uuid,
  p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.workflows
  SET total_executions = COALESCE(total_executions, 0) + 1,
      success_count = CASE
        WHEN p_success THEN COALESCE(success_count, 0) + 1
        ELSE COALESCE(success_count, 0)
      END,
      failed_count = CASE
        WHEN NOT p_success THEN COALESCE(failed_count, 0) + 1
        ELSE COALESCE(failed_count, 0)
      END,
      last_run_at = now(),
      updated_at = now()
  WHERE id = p_workflow_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gen_vat_claim_token()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := encode(extensions.gen_random_bytes(18), 'base64');
  v_token := replace(replace(replace(v_token, '+', ''), '/', ''), '=', '');
  RETURN substring(v_token, 1, 24);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_vat_claim_token(p_invoice_id uuid)
RETURNS TABLE(token text, expires_at timestamptz, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice public.guest_invoices%ROWTYPE;
  v_existing public.invoice_vat_claims%ROWTYPE;
  v_token text;
  v_user_tenant uuid;
BEGIN
  v_user_tenant := public.get_current_user_tenant_id();
  SELECT gi.* INTO v_invoice
  FROM public.guest_invoices gi
  WHERE gi.id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF v_invoice.tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT ivc.* INTO v_existing
  FROM public.invoice_vat_claims ivc
  WHERE ivc.invoice_id = p_invoice_id
    AND ivc.status IN ('pending', 'submitted')
    AND ivc.expires_at > now()
  ORDER BY ivc.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.claim_token, v_existing.expires_at, v_existing.status;
    RETURN;
  END IF;

  v_token := public.gen_vat_claim_token();
  INSERT INTO public.invoice_vat_claims (invoice_id, tenant_id, hotel_id, claim_token)
  VALUES (p_invoice_id, v_invoice.tenant_id, v_invoice.hotel_id, v_token);

  UPDATE public.guest_invoices gi
  SET vat_claim_status = CASE
    WHEN gi.vat_claim_status = 'none' THEN 'pending'
    ELSE gi.vat_claim_status
  END
  WHERE gi.id = p_invoice_id;

  RETURN QUERY SELECT v_token, (now() + interval '7 days')::timestamptz, 'pending'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_stay_registration(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_tenant uuid;
  v_booking record;
  v_room_number text;
  v_count int := 0;
BEGIN
  SELECT u.tenant_id INTO v_user_tenant
  FROM public.users u
  WHERE u.id = auth.uid();

  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF v_booking IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_user_tenant IS NOT NULL AND v_user_tenant <> v_booking.tenant_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_room_number := COALESCE(v_booking.rno, 'N/A');

  IF v_booking.guest_id IS NOT NULL THEN
    INSERT INTO public.guest_stay_registrations(
      tenant_id, hotel_id, booking_id, guest_id, room_number,
      check_in_at, check_out_at, status
    ) VALUES (
      v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
      v_room_number,
      COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
      COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
      'pending'
    ) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_guests'
  ) THEN
    INSERT INTO public.guest_stay_registrations(
      tenant_id, hotel_id, booking_id, guest_id, room_number,
      check_in_at, check_out_at, status
    )
    SELECT v_booking.tenant_id, v_booking.hotel_id, v_booking.id, bg.guest_id,
           v_room_number,
           COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
           COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
           'pending'
    FROM public.booking_guests bg
    WHERE bg.booking_id = v_booking.id AND bg.guest_id IS NOT NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._enqueue_stay_registration_internal(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_room_number text;
  v_count int := 0;
BEGIN
  SELECT b.*, r.room_number AS rno
  INTO v_booking
  FROM public.room_bookings b
  LEFT JOIN public.rooms r ON r.id = b.room_id
  WHERE b.id = p_booking_id;

  IF v_booking IS NULL THEN RETURN 0; END IF;
  v_room_number := COALESCE(v_booking.rno, 'N/A');

  IF v_booking.guest_id IS NOT NULL THEN
    INSERT INTO public.guest_stay_registrations(
      tenant_id, hotel_id, booking_id, guest_id, room_number,
      check_in_at, check_out_at, status
    ) VALUES (
      v_booking.tenant_id, v_booking.hotel_id, v_booking.id, v_booking.guest_id,
      v_room_number,
      COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
      COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
      'pending'
    ) ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_guests'
  ) THEN
    INSERT INTO public.guest_stay_registrations(
      tenant_id, hotel_id, booking_id, guest_id, room_number,
      check_in_at, check_out_at, status
    )
    SELECT v_booking.tenant_id, v_booking.hotel_id, v_booking.id, bg.guest_id,
           v_room_number,
           COALESCE(v_booking.actual_check_in, v_booking.check_in_date::timestamptz),
           COALESCE(v_booking.actual_check_out, v_booking.check_out_date::timestamptz),
           'pending'
    FROM public.booking_guests bg
    WHERE bg.booking_id = v_booking.id AND bg.guest_id IS NOT NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(
  _booking_id uuid,
  _reason text DEFAULT NULL,
  _refund_deposit boolean DEFAULT true
)
RETURNS public.room_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.room_bookings;
  v_uid uuid := auth.uid();
  v_can_manage boolean;
  v_hours_overdue numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT rb.* INTO v_booking FROM public.room_bookings rb WHERE rb.id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_BOOKING_STATUS_FOR_NO_SHOW';
  END IF;

  v_can_manage := EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid
      AND (u.tenant_id = v_booking.tenant_id OR u.user_level_code = 'super_admin')
      AND (u.user_level_code IN ('super_admin', 'tenant_owner')
           OR public.has_permission(v_uid, 'manage_bookings'))
  );
  IF NOT v_can_manage THEN RAISE EXCEPTION 'NO_PERMISSION_BOOKING_FLAG'; END IF;

  SELECT o.hours_overdue INTO v_hours_overdue
  FROM public.v_overdue_checkins o
  WHERE o.id = _booking_id;
  IF v_hours_overdue IS NULL OR v_hours_overdue <= 0 THEN
    RAISE EXCEPTION 'NOT_OVERDUE';
  END IF;

  IF NOT _refund_deposit AND COALESCE(v_booking.deposit_amount, 0) > 0 THEN
    INSERT INTO public.booking_payments(
      tenant_id, hotel_id, booking_id, amount, payment_method,
      payment_status, paid_at, created_by, metadata, notes
    ) VALUES (
      v_booking.tenant_id, v_booking.hotel_id, v_booking.id,
      v_booking.deposit_amount, 'deposit', 'completed',
      COALESCE(v_booking.paid_at, now()), v_uid,
      jsonb_build_object('type', 'no_show_fee', 'reason', _reason),
      'Giữ cọc làm phí No-Show'
    );
  END IF;

  RETURN public.transition_booking_status(
    _booking_id := _booking_id,
    _to_status := 'no_show',
    _reason := COALESCE(_reason, format('Quá giờ check-in %s giờ', round(v_hours_overdue, 1)))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_turnover_analysis(
  p_tenant_id uuid,
  p_hotel_id uuid,
  p_months integer DEFAULT 3
)
RETURNS TABLE(
  item_id uuid,
  item_code text,
  item_name text,
  category_name text,
  avg_stock numeric,
  total_usage numeric,
  turnover_rate numeric,
  days_in_stock numeric,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start_date date := CURRENT_DATE - (p_months || ' months')::interval;
BEGIN
  RETURN QUERY
  WITH item_usage AS (
    SELECT it.item_id,
           AVG(i.quantity_in_stock)::numeric AS avg_stock,
           SUM(ABS(it.quantity)::numeric) FILTER (WHERE it.transaction_type = 'out') AS total_out
    FROM public.inventory_transactions it
    JOIN public.items i ON i.id = it.item_id
    WHERE it.tenant_id = p_tenant_id
      AND (p_hotel_id IS NULL OR it.hotel_id = p_hotel_id)
      AND it.transaction_date >= v_start_date
    GROUP BY it.item_id
  )
  SELECT i.id,
         i.code,
         i.name,
         c.name,
         COALESCE(iu.avg_stock, i.quantity_in_stock::numeric),
         COALESCE(iu.total_out, 0::numeric),
         CASE
           WHEN COALESCE(iu.avg_stock, i.quantity_in_stock::numeric) > 0
           THEN ROUND(COALESCE(iu.total_out, 0::numeric)
             / COALESCE(iu.avg_stock, i.quantity_in_stock::numeric), 2)
           ELSE 0::numeric
         END,
         CASE
           WHEN COALESCE(iu.total_out, 0::numeric) > 0
           THEN ROUND((COALESCE(iu.avg_stock, i.quantity_in_stock::numeric)
             * (p_months * 30)::numeric)
             / COALESCE(iu.total_out, 1::numeric), 2)
           ELSE 999::numeric
         END,
         CASE
           WHEN COALESCE(iu.total_out, 0::numeric) = 0 THEN 'slow'
           WHEN COALESCE(iu.total_out, 0::numeric)
             / NULLIF(COALESCE(iu.avg_stock, i.quantity_in_stock::numeric), 0) > 6 THEN 'fast'
           WHEN COALESCE(iu.total_out, 0::numeric)
             / NULLIF(COALESCE(iu.avg_stock, i.quantity_in_stock::numeric), 0) > 3 THEN 'medium'
           ELSE 'slow'
         END::text
  FROM public.items i
  LEFT JOIN public.item_categories c ON c.id = i.category_id
  LEFT JOIN item_usage iu ON iu.item_id = i.id
  WHERE i.tenant_id = p_tenant_id
    AND (p_hotel_id IS NULL OR i.hotel_id = p_hotel_id)
    AND i.status = 'active'
  ORDER BY COALESCE(iu.total_out, 0::numeric)
    / NULLIF(COALESCE(iu.avg_stock, i.quantity_in_stock::numeric), 0) DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_plan_change(
  p_tenant_id uuid,
  p_new_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_usage record;
  v_new_plan record;
  v_warnings jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  SELECT tu.* INTO v_current_usage
  FROM public.tenant_usage tu
  WHERE tu.tenant_id = p_tenant_id;
  SELECT sp.* INTO v_new_plan
  FROM public.subscription_plans sp
  WHERE sp.id = p_new_plan_id;

  IF v_current_usage IS NULL OR v_new_plan IS NULL THEN
    RETURN jsonb_build_object(
      'can_change', false,
      'blockers', jsonb_build_array(jsonb_build_object('resource', 'plan', 'message', 'Không tìm thấy gói hoặc dữ liệu sử dụng')),
      'warnings', v_warnings
    );
  END IF;

  IF v_new_plan.max_hotels IS NOT NULL
     AND v_current_usage.current_hotels_count > v_new_plan.max_hotels THEN
    v_blockers := v_blockers || jsonb_build_object(
      'resource', 'hotels',
      'current', v_current_usage.current_hotels_count,
      'limit', v_new_plan.max_hotels,
      'message', format('Bạn có %s khách sạn nhưng gói mới chỉ cho phép %s. Vui lòng xóa %s khách sạn trước.',
        v_current_usage.current_hotels_count,
        v_new_plan.max_hotels,
        v_current_usage.current_hotels_count - v_new_plan.max_hotels)
    );
  END IF;

  IF v_new_plan.max_users IS NOT NULL
     AND v_current_usage.current_users_count > v_new_plan.max_users THEN
    v_blockers := v_blockers || jsonb_build_object(
      'resource', 'users',
      'current', v_current_usage.current_users_count,
      'limit', v_new_plan.max_users,
      'message', format('Bạn có %s người dùng nhưng gói mới chỉ cho phép %s. Vui lòng xóa %s người dùng trước.',
        v_current_usage.current_users_count,
        v_new_plan.max_users,
        v_current_usage.current_users_count - v_new_plan.max_users)
    );
  END IF;

  IF v_new_plan.max_storage_gb IS NOT NULL
     AND (v_current_usage.current_storage_bytes / 1073741824.0) > v_new_plan.max_storage_gb THEN
    v_warnings := v_warnings || jsonb_build_object(
      'resource', 'storage',
      'current_gb', round((v_current_usage.current_storage_bytes / 1073741824.0)::numeric, 2),
      'limit_gb', v_new_plan.max_storage_gb,
      'message', format('Bạn đang dùng %s GB nhưng gói mới chỉ cho phép %s GB. Vui lòng xóa tệp để tiếp tục.',
        to_char((v_current_usage.current_storage_bytes / 1073741824.0)::numeric, 'FM999999990.00'),
        v_new_plan.max_storage_gb)
    );
  END IF;

  RETURN jsonb_build_object(
    'can_change', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', v_warnings
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_apply_read_only_after_grace()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_default_grace integer := 7;
  v_count integer := 0;
  r record;
BEGIN
  SELECT COALESCE((ps.value->>'grace_period_days')::int, 7)
  INTO v_default_grace
  FROM public.platform_settings ps
  WHERE ps.key = 'grace_period_days'
  LIMIT 1;

  FOR r IN
    SELECT t.id,
           COALESCE(t.grace_period_days_override, v_default_grace) AS grace_days
    FROM public.tenants t
    WHERE t.is_read_only = false
      AND t.subscription_end_date IS NOT NULL
      AND t.subscription_end_date < (
        now() - make_interval(days => COALESCE(t.grace_period_days_override, v_default_grace))
      )
  LOOP
    UPDATE public.tenants
    SET is_read_only = true,
        read_only_reason = 'Hết ' || r.grace_days || ' ngày ân hạn — chuyển sang chỉ đọc.',
        read_only_since = now(),
        updated_at = now()
    WHERE id = r.id;

    PERFORM public.log_state_transition(
      r.id, NULL, 'tenants', r.id,
      'auto_set_read_only', 'active', 'read_only', 'grace_period_expired',
      jsonb_build_object('grace_days', r.grace_days, 'source', 'cron')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_clear_read_only_after_renewal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT t.id, t.read_only_reason
    FROM public.tenants t
    WHERE t.is_read_only = true
      AND t.subscription_status IN ('active', 'trial')
      AND (
        (t.grace_period_ends_at IS NOT NULL AND t.grace_period_ends_at > now())
        OR (t.subscription_end_date IS NOT NULL AND t.subscription_end_date > current_date)
      )
  LOOP
    UPDATE public.tenants
    SET is_read_only = false,
        read_only_reason = NULL,
        read_only_since = NULL,
        updated_at = now()
    WHERE id = r.id;

    PERFORM public.log_state_transition(
      r.id, NULL, 'tenants', r.id,
      'auto_clear_read_only', 'read_only', 'active',
      'Subscription đã được gia hạn — tự động bỏ chế độ chỉ đọc.',
      jsonb_build_object('source', 'cron', 'prev_reason', r.read_only_reason)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_close_stale_shifts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_closed_count integer := 0;
  v_now timestamptz := now();
  v_row record;
BEGIN
  FOR v_row IN
    SELECT ss.user_id, ss.tenant_id, ss.shift_start_at
    FROM public.staff_status ss
    WHERE ss.shift_start_at IS NOT NULL
      AND (ss.shift_end_at IS NULL OR ss.shift_end_at < ss.shift_start_at)
      AND ss.shift_start_at < v_now - interval '16 hours'
  LOOP
    UPDATE public.staff_status
    SET shift_end_at = v_now,
        status = 'offline',
        current_activity = NULL,
        current_activity_type = NULL,
        current_location = NULL,
        updated_at = v_now
    WHERE user_id = v_row.user_id;

    INSERT INTO public.audit_log(
      tenant_id, table_name, record_id, action, actor_id,
      new_data, context, created_at
    ) VALUES (
      v_row.tenant_id, 'staff_status', v_row.user_id,
      'auto_close_stale_shift', NULL,
      jsonb_build_object('shift_start_at', v_row.shift_start_at, 'closed_at', v_now),
      jsonb_build_object('reason', 'shift_exceeded_16h'), v_now
    );
    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('closed_count', v_closed_count, 'ran_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.perform_quick_room_check(
  _room_id uuid,
  _check_type text DEFAULT 'daily',
  _notes text DEFAULT NULL,
  _photos text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_hotel_id uuid;
  v_room_status text;
  v_user_tenant uuid;
  v_photo_mode public.photo_evidence_mode;
  v_quick_enabled boolean;
  v_rate_limit_min int;
  v_last_quick timestamptz;
  v_check_id uuid;
  v_ok_count int;
  v_old_status text;
  v_new_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF _check_type NOT IN ('daily', 'periodic') THEN
    RAISE EXCEPTION 'quick_path_not_allowed:%', _check_type USING ERRCODE = '22023';
  END IF;

  SELECT r.tenant_id, r.hotel_id, r.status
  INTO v_tenant_id, v_hotel_id, v_room_status
  FROM public.rooms r
  WHERE r.id = _room_id
  FOR UPDATE;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002'; END IF;

  v_user_tenant := public.get_current_user_tenant_id();
  IF v_tenant_id <> v_user_tenant THEN RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE = '42501'; END IF;

  SELECT h.photo_evidence_mode,
         COALESCE((h.settings->'room_check'->>'quick_path_enabled')::boolean, true),
         COALESCE((h.settings->'room_check'->>'quick_path_rate_limit_minutes')::int, 30)
  INTO v_photo_mode, v_quick_enabled, v_rate_limit_min
  FROM public.hotels h
  WHERE h.id = v_hotel_id;

  IF NOT v_quick_enabled THEN RAISE EXCEPTION 'quick_path_disabled' USING ERRCODE = 'P0001'; END IF;

  SELECT MAX(rc.checked_at) INTO v_last_quick
  FROM public.room_checks rc
  WHERE rc.room_id = _room_id AND rc.check_mode = 'quick';
  IF v_last_quick IS NOT NULL
     AND v_last_quick > now() - (v_rate_limit_min || ' minutes')::interval THEN
    RAISE EXCEPTION 'quick_rate_limited:%', v_rate_limit_min USING ERRCODE = 'P0001';
  END IF;

  IF v_photo_mode = 'always' AND COALESCE(array_length(_photos, 1), 0) = 0 THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(ri.standard_quantity), 0)::int
  INTO v_ok_count
  FROM public.room_items ri
  WHERE ri.room_id = _room_id;

  v_old_status := v_room_status;
  INSERT INTO public.room_checks(
    room_id, tenant_id, hotel_id, checked_by, check_type, check_mode,
    status, cleanliness_score, items_complete, summary_ok_count,
    summary_issue_count, minibar_count, notes, photos, checked_at
  ) VALUES (
    _room_id, v_tenant_id, v_hotel_id, v_user_id, _check_type, 'quick',
    'submitted', 5, true, v_ok_count, 0, 0, _notes,
    COALESCE(_photos, '{}'::text[]), now()
  ) RETURNING id INTO v_check_id;

  DELETE FROM public.room_check_sessions WHERE room_id = _room_id;

  IF v_room_status IN ('cleaning', 'dirty') THEN
    BEGIN
      PERFORM public.transition_room_status(
        _room_id := _room_id,
        _to_status := 'available',
        _reason := 'Quick room check OK',
        _dnd_until := NULL,
        _oos_until := NULL,
        _force := false
      );
      v_new_status := 'available';
    EXCEPTION WHEN OTHERS THEN
      v_new_status := v_old_status;
    END;
  ELSE
    v_new_status := v_old_status;
  END IF;

  PERFORM public.log_state_transition(
    v_tenant_id, v_hotel_id, 'room_checks', v_check_id,
    'quick_submit', v_old_status, COALESCE(v_new_status, v_old_status), NULL,
    jsonb_build_object('check_type', _check_type, 'mode', 'quick')
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'room_id', _room_id,
    'old_status', v_old_status,
    'new_status', COALESCE(v_new_status, v_old_status),
    'summary_ok_count', v_ok_count
  );
END;
$$;
