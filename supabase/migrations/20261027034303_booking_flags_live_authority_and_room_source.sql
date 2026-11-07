-- RW5 first delivery: live authority, canonical flag source and occupied-stay
-- checkout. No-show deposit accounting/client recovery remain a separate delta.
ALTER TABLE public.room_bookings ADD COLUMN booking_flag_room_status text
  CHECK(booking_flag_room_status IN('occupied_clean','occupied_dirty'));
ALTER TABLE private.booking_room_commands DROP CONSTRAINT booking_room_commands_operation_check;
ALTER TABLE private.booking_room_commands ADD CONSTRAINT booking_room_commands_operation_check
  CHECK(operation IN('transfer','checkin','checkout','group_checkout','booking_flag'));

CREATE FUNCTION private.booking_flag_request(p_booking_id uuid,p_to_status text,p_reason text,p_amount_owed numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF p_booking_id IS NULL OR p_to_status IS NULL OR p_to_status NOT IN('sleep_out','skipper','checked_in')
    OR COALESCE(length(p_reason),0)>4000 OR (p_amount_owed IS NOT NULL AND
      (p_to_status<>'skipper' OR p_amount_owed::text IN('NaN','Infinity','-Infinity')
        OR p_amount_owed<0 OR p_amount_owed>99999999999999 OR p_amount_owed<>trunc(p_amount_owed))) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FLAG_INPUT' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('booking_id',p_booking_id,'to_status',p_to_status,'reason',p_reason,'amount_owed',p_amount_owed);
END;
$fn$;
REVOKE ALL ON FUNCTION private.booking_flag_request(uuid,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;

-- This trigger is now a guard, not an independent room writer. A caller-set GUC
-- is only an index into a private, same-transaction prepared command. It grants
-- no authority by itself, and a committed/cancelled receipt cannot be reused.
CREATE OR REPLACE FUNCTION public.fn_sync_room_status_on_booking_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid; v_command private.booking_room_commands%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.booking_flag_room_status IS NOT NULL THEN
      RAISE EXCEPTION 'BOOKING_FLAG_CORE_REQUIRED' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF NOT((NEW.status IS DISTINCT FROM OLD.status AND (NEW.status IN('sleep_out','skipper')
      OR (OLD.status='sleep_out' AND NEW.status='checked_in')))
    OR (NEW.booking_flag_room_status IS DISTINCT FROM OLD.booking_flag_room_status
      AND NOT(NEW.status='checked_out' AND NEW.booking_flag_room_status IS NULL))) THEN RETURN NEW; END IF;
  BEGIN v_id:=NULLIF(current_setting('roomqc.booking_flag_command',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'BOOKING_FLAG_CORE_REQUIRED' USING ERRCODE='42501'; END;
  SELECT * INTO v_command FROM private.booking_room_commands WHERE actor_id=auth.uid() AND command_id=v_id;
  IF NOT FOUND OR v_command.operation<>'booking_flag' OR v_command.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR v_command.booking_ids IS DISTINCT FROM ARRAY[NEW.id] OR v_command.room_ids IS DISTINCT FROM ARRAY[NEW.room_id]
    OR v_command.result->>'state' IS DISTINCT FROM 'executing'
    OR v_command.result->>'transaction_id' IS DISTINCT FROM pg_current_xact_id()::text
    OR v_command.result->>'old_booking_status' IS DISTINCT FROM OLD.status
    OR v_command.request->>'to_status' IS DISTINCT FROM NEW.status
    OR NOT EXISTS(SELECT 1 FROM public.rooms r WHERE r.id=NEW.room_id AND r.tenant_id=NEW.tenant_id
      AND r.hotel_id=NEW.hotel_id AND r.status=v_command.result->>'expected_room_status') THEN
    RAISE EXCEPTION 'BOOKING_FLAG_CORE_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_sync_room_status_on_booking_flag() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER trg_sync_room_status_on_booking_flag ON public.room_bookings;
CREATE TRIGGER trg_sync_room_status_on_booking_flag BEFORE INSERT OR UPDATE OF status,booking_flag_room_status
  ON public.room_bookings FOR EACH ROW EXECUTE FUNCTION public.fn_sync_room_status_on_booking_flag();

-- An invoker trigger sees the effective database role. It rejects direct REST
-- status writes before trying any actor locks. Calls from guarded postgres-owned
-- SECURITY DEFINER operations retain their original actor->booking lock order.
-- Legacy service-role imports remain inventoried separately; ordinary clients
-- may insert pending/confirmed reservations but cannot manufacture an active stay.
CREATE FUNCTION private.guard_booking_status_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='INSERT' THEN
    IF current_user NOT IN('postgres','service_role') AND NEW.status NOT IN('pending','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_STATUS_CORE_REQUIRED' USING ERRCODE='42501'; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND current_user<>'postgres'
    AND (NEW.status IN('checked_in','checked_out','sleep_out','skipper','cancelled','no_show')
      OR OLD.status IN('checked_in','sleep_out','skipper')) THEN
    RAISE EXCEPTION 'BOOKING_STATUS_CORE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_booking_status_entry() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_booking_status_entry BEFORE INSERT OR UPDATE OF status ON public.room_bookings
  FOR EACH ROW EXECUTE FUNCTION private.guard_booking_status_entry();

CREATE FUNCTION public.transition_booking_flag(p_booking_id uuid,p_to_status text,p_reason text DEFAULT NULL,
  p_amount_owed numeric DEFAULT NULL,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;v_after public.room_bookings%ROWTYPE;
  v_room public.rooms%ROWTYPE;v_command uuid:=COALESCE(p_command_id,gen_random_uuid());v_request jsonb;v_result jsonb;
  v_source jsonb;v_target text;v_previous text;v_old_setting text;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  v_request:=private.booking_flag_request(p_booking_id,p_to_status,p_reason,p_amount_owed);
  v_result:=private.replay_booking_room_command(v_command,'booking_flag',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[v_booking.room_id]);
  SELECT * INTO v_room FROM public.rooms WHERE id=v_booking.room_id;
  IF v_room.hotel_id IS DISTINCT FROM v_booking.hotel_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF NOT((v_booking.status='checked_in' AND p_to_status IN('sleep_out','skipper'))
    OR (v_booking.status='sleep_out' AND p_to_status IN('checked_in','skipper'))) THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FLAG_TRANSITION' USING ERRCODE='PT409'; END IF;
  IF (v_booking.status='checked_in' AND v_room.status NOT IN('occupied_clean','occupied_dirty'))
    OR (v_booking.status='sleep_out' AND v_room.status<>'sleep_out') THEN
    RAISE EXCEPTION 'BOOKING_ROOM_STATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  v_previous:=CASE WHEN v_booking.status='checked_in' THEN v_room.status
    ELSE COALESCE(v_booking.booking_flag_room_status,'occupied_dirty') END;
  v_target:=CASE WHEN p_to_status='checked_in' THEN v_previous ELSE p_to_status END;
  INSERT INTO private.booking_room_commands(actor_id,command_id,operation,tenant_id,booking_ids,room_ids,session_id,request,result)
    VALUES(v_actor.id,v_command,'booking_flag',v_actor.tenant_id,ARRAY[p_booking_id],ARRAY[v_booking.room_id],
      (auth.jwt()->>'session_id')::uuid,v_request,jsonb_build_object('state','executing','transaction_id',pg_current_xact_id()::text,
        'old_booking_status',v_booking.status,'expected_room_status',v_target));
  v_source:=public.transition_room_status(v_room.id,v_target,p_reason,NULL,NULL,false,v_command);
  v_old_setting:=current_setting('roomqc.booking_flag_command',true);
  PERFORM set_config('roomqc.booking_flag_command',v_command::text,true);
  UPDATE public.room_bookings SET status=p_to_status,
    booking_flag_room_status=CASE WHEN p_to_status='checked_in' THEN NULL ELSE v_previous END,
    sleep_out_at=CASE WHEN p_to_status='sleep_out' THEN clock_timestamp() ELSE sleep_out_at END,
    sleep_out_reason=CASE WHEN p_to_status='sleep_out' THEN p_reason ELSE sleep_out_reason END,
    skipper_at=CASE WHEN p_to_status='skipper' THEN clock_timestamp() ELSE skipper_at END,
    skipper_reason=CASE WHEN p_to_status='skipper' THEN p_reason ELSE skipper_reason END,
    skipper_amount_owed=CASE WHEN p_to_status='skipper' THEN COALESCE(p_amount_owed,skipper_amount_owed) ELSE skipper_amount_owed END,
    updated_at=clock_timestamp() WHERE id=p_booking_id RETURNING * INTO v_after;
  PERFORM set_config('roomqc.booking_flag_command',COALESCE(v_old_setting,''),true);
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'booking_transition',v_booking.status,p_to_status,p_reason,jsonb_build_object('command_id',v_command,'room_id',v_room.id));
  PERFORM private.assert_room_transition_session();
  v_result:=jsonb_build_object('success',true,'command_id',v_command,'operation','booking_flag','replayed',false,
    'tenant_id',v_actor.tenant_id,'hotel_id',v_booking.hotel_id,'booking_id',p_booking_id,'room_id',v_room.id,
    'previous_status',v_booking.status,'status',p_to_status,'booking',to_jsonb(v_after),
    'workflow_event_id',v_source->'workflow_event_id','room_transition',v_source);
  UPDATE private.booking_room_commands SET result=v_result WHERE actor_id=v_actor.id AND command_id=v_command;
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.transition_booking_flag(uuid,text,text,numeric,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.transition_booking_flag(uuid,text,text,numeric,uuid) TO authenticated;

-- Keep the four-argument row-returning endpoint for existing consumers. Terminal
-- checkout can no longer bypass its invoice/core; cancellation uses the actual
-- cancellation path, and direct no-show must obey the same overdue rule.
CREATE OR REPLACE FUNCTION public.transition_booking_status(_booking_id uuid,_to_status text,
  _reason text DEFAULT NULL,_amount_owed numeric DEFAULT NULL)
RETURNS public.room_bookings LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;v_result jsonb;
BEGIN
  IF _to_status IN('sleep_out','skipper','checked_in') THEN
    v_result:=public.transition_booking_flag(_booking_id,_to_status,_reason,_amount_owed,NULL);
    RETURN jsonb_populate_record(NULL::public.room_bookings,v_result->'booking');
  END IF;
  v_actor:=private.lock_booking_operation_actor();
  IF _booking_id IS NULL OR _to_status IS NULL OR COALESCE(length(_reason),0)>4000 OR _amount_owed IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FLAG_INPUT' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[_booking_id],ARRAY[v_booking.room_id]);
  IF _to_status='checked_out' THEN RAISE EXCEPTION 'USE_CHECKOUT_OPERATION' USING ERRCODE='PT409'; END IF;
  IF v_booking.status<>'confirmed' OR _to_status NOT IN('cancelled','no_show') THEN
    RAISE EXCEPTION 'INVALID_BOOKING_TRANSITION' USING ERRCODE='PT409'; END IF;
  IF _to_status='cancelled' THEN
    PERFORM public.cancel_booking(_booking_id,v_booking.room_id,_reason,false);
    SELECT * INTO v_booking FROM public.room_bookings WHERE id=_booking_id;
    RETURN v_booking;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.v_overdue_checkins WHERE id=_booking_id AND hours_overdue>0) THEN
    RAISE EXCEPTION 'NOT_OVERDUE' USING ERRCODE='PT409'; END IF;
  UPDATE public.room_bookings SET status='no_show',updated_at=clock_timestamp() WHERE id=_booking_id;
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',_booking_id,
    'booking_transition',v_booking.status,'no_show',_reason,'{}'::jsonb);
  PERFORM private.assert_room_transition_session();
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=_booking_id;
  RETURN v_booking;
END;
$fn$;
REVOKE ALL ON FUNCTION public.transition_booking_status(uuid,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.transition_booking_status(uuid,text,text,numeric) TO authenticated;

-- Cancel an unoccupied reservation without rewriting a potentially shared room.
-- The legacy accounting body is private; current authority/scope is mandatory.
ALTER FUNCTION public.cancel_booking(uuid,uuid,text,boolean) SET SCHEMA private;
ALTER FUNCTION private.cancel_booking(uuid,uuid,text,boolean) RENAME TO legacy_cancel_booking_v1;
REVOKE ALL ON FUNCTION private.legacy_cancel_booking_v1(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.cancel_booking(p_booking_id uuid,p_room_id uuid DEFAULT NULL,p_reason text DEFAULT NULL,p_refund_deposit boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;v_result jsonb;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_refund_deposit IS NULL OR COALESCE(length(p_reason),0)>4000 THEN
    RAISE EXCEPTION 'INVALID_CANCEL_BOOKING_INPUT' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[v_booking.room_id]);
  IF p_room_id IS NOT NULL AND p_room_id IS DISTINCT FROM v_booking.room_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF v_booking.status NOT IN('pending','confirmed') THEN
    RAISE EXCEPTION 'USE_CHECKOUT_OPERATION' USING ERRCODE='PT409'; END IF;
  v_result:=private.legacy_cancel_booking_v1(p_booking_id,NULL,p_reason,p_refund_deposit);
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'booking_cancel',v_booking.status,'cancelled',p_reason,jsonb_build_object('refund_pending',v_result->'refund_recorded'));
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid,uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(_booking_id uuid,_reason text DEFAULT NULL,_refund_deposit boolean DEFAULT true)
RETURNS public.room_bookings LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF _booking_id IS NULL OR _refund_deposit IS NULL OR COALESCE(length(_reason),0)>4000 THEN
    RAISE EXCEPTION 'INVALID_NO_SHOW_INPUT' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[_booking_id],ARRAY[v_booking.room_id]);
  IF v_booking.status<>'confirmed' THEN RAISE EXCEPTION 'INVALID_BOOKING_STATUS_FOR_NO_SHOW' USING ERRCODE='PT409'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.v_overdue_checkins WHERE id=_booking_id AND hours_overdue>0) THEN
    RAISE EXCEPTION 'NOT_OVERDUE' USING ERRCODE='PT409'; END IF;
  -- Preserve the existing accounting path for the next explicit ledger delta.
  -- Its deposit-method mismatch is intentionally still a red acceptance case.
  IF NOT _refund_deposit AND COALESCE(v_booking.deposit_amount,0)>0 THEN
    INSERT INTO public.booking_payments(tenant_id,hotel_id,booking_id,amount,payment_method,payment_status,paid_at,created_by,metadata,notes)
      VALUES(v_booking.tenant_id,v_booking.hotel_id,v_booking.id,v_booking.deposit_amount,'deposit','completed',
        COALESCE(v_booking.paid_at,clock_timestamp()),v_actor.id,jsonb_build_object('type','no_show_fee','reason',_reason),'Giữ cọc làm phí No-Show');
  END IF;
  RETURN public.transition_booking_status(_booking_id,'no_show',_reason,NULL);
END;
$fn$;
REVOKE ALL ON FUNCTION public.mark_booking_no_show(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(uuid,text,boolean) TO authenticated;

-- Occupied booking flags participate in checkout and conflict checks.
CREATE OR REPLACE FUNCTION public.perform_checkin(p_booking_id uuid,p_room_id uuid,p_early_checkin_charge numeric DEFAULT 0,p_command_id uuid DEFAULT NULL,p_adjustment_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_command uuid:=COALESCE(p_command_id,gen_random_uuid()); v_request jsonb; v_result jsonb; v_source jsonb; v_now timestamptz;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_room_id IS NULL OR p_early_checkin_charge IS NULL OR p_early_checkin_charge<0
    OR p_early_checkin_charge::text IN('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'INVALID_CHECKIN_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('booking_id',p_booking_id,'room_id',p_room_id,'early_checkin_charge',p_early_checkin_charge);
  v_request:=private.booking_adjustment_request(v_request,p_adjustment_notes);
  v_result:=private.replay_booking_room_command(v_command,'checkin',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[p_room_id]);
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id;
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id;
  IF v_booking.room_id IS DISTINCT FROM p_room_id OR v_booking.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF v_booking.status NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'BOOKING_NOT_VALID' USING ERRCODE='PT409'; END IF;
  -- Legacy aliases/reserved are excluded by the current rooms_status_check.
  IF v_room.status NOT IN('vacant_clean','vacant_inspected') THEN
    RAISE EXCEPTION 'ROOM_NOT_READY_FOR_CHECKIN' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.room_bookings WHERE room_id=p_room_id AND id<>p_booking_id AND status IN('checked_in','sleep_out','skipper')) THEN
    RAISE EXCEPTION 'ROOM_OCCUPIED' USING ERRCODE='PT409'; END IF;
  v_now:=clock_timestamp();
  -- The existing pricing trigger is UPDATE OF amount_paid,total_amount. Include
  -- its totals column when changing the quote; the trigger owns the final value.
  UPDATE public.room_bookings SET status='checked_in',actual_check_in=v_now,
    subtotal=CASE WHEN COALESCE(subtotal,0)>0
      THEN subtotal-COALESCE(early_checkin_charge,0)+p_early_checkin_charge ELSE subtotal END,
    early_checkin_charge=p_early_checkin_charge,total_amount=total_amount WHERE id=p_booking_id;
  v_source:=public.transition_room_status(p_room_id,'occupied_clean','Nhận phòng',NULL,NULL,false,v_command);
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'checkin',v_booking.status,'checked_in',NULL,jsonb_build_object('command_id',v_command,'room_id',p_room_id));
  RETURN private.save_booking_room_command(v_command,'checkin',ARRAY[p_booking_id],ARRAY[p_room_id],v_request,
    jsonb_build_object('success',true,'booking_id',p_booking_id,'room_id',p_room_id,'checked_in_at',v_now,
      'workflow_event_id',v_source->'workflow_event_id','room_transition',v_source));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.perform_checkout(p_booking_id uuid,p_room_id uuid,p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,p_subtotal numeric DEFAULT 0,p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,p_damage_items jsonb DEFAULT '[]',p_new_amount_paid numeric DEFAULT NULL,
  p_check_out_date date DEFAULT NULL,p_command_id uuid DEFAULT NULL,p_adjustment_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE; v_after public.room_bookings%ROWTYPE;
  v_room public.rooms%ROWTYPE; v_command uuid:=COALESCE(p_command_id,gen_random_uuid());
  v_request jsonb; v_result jsonb; v_source jsonb; v_amount numeric;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_room_id IS NULL THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_new_amount_paid IS NOT NULL THEN RAISE EXCEPTION 'DIRECT_AMOUNT_PAID_UPDATE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  FOREACH v_amount IN ARRAY ARRAY[p_late_checkout_charge,p_service_charges,p_subtotal,p_damage_charges] LOOP
    IF v_amount IS NULL OR v_amount<0 OR v_amount::text IN('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'INVALID_CHECKOUT_AMOUNT' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_damage_charges>p_subtotal THEN RAISE EXCEPTION 'DAMAGE_EXCEEDS_SUBTOTAL' USING ERRCODE='22023'; END IF;
  IF p_damage_items IS NULL OR jsonb_typeof(p_damage_items)<>'array' OR jsonb_array_length(p_damage_items)>1000 THEN
    RAISE EXCEPTION 'INVALID_DAMAGE_ITEMS' USING ERRCODE='22023'; END IF;
  IF COALESCE(length(p_damage_notes),0)>10000 THEN RAISE EXCEPTION 'DAMAGE_NOTES_TOO_LONG' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('booking_id',p_booking_id,'room_id',p_room_id,'late_checkout_charge',p_late_checkout_charge,
    'service_charges',p_service_charges,'subtotal',p_subtotal,'damage_charges',p_damage_charges,
    'damage_notes',p_damage_notes,'damage_items',p_damage_items,'check_out_date',p_check_out_date);
  v_request:=private.booking_adjustment_request(v_request,p_adjustment_notes);
  v_result:=private.replay_booking_room_command(v_command,'checkout',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[p_room_id]);
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id;
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id;
  IF v_booking.room_id IS DISTINCT FROM p_room_id OR v_booking.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF v_booking.status NOT IN('checked_in','sleep_out','skipper') THEN RAISE EXCEPTION 'BOOKING_NOT_CHECKED_IN' USING ERRCODE='PT409'; END IF;
  IF v_room.status NOT IN('occupied_clean','occupied_dirty','dnd','service_refused','sleep_out','skipper') THEN
    RAISE EXCEPTION 'ROOM_NOT_OCCUPIED' USING ERRCODE='PT409'; END IF;
  IF p_check_out_date IS NOT NULL AND (p_check_out_date<v_booking.check_in_date OR p_check_out_date>current_date) THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_DATE' USING ERRCODE='22023'; END IF;
  IF COALESCE(v_booking.vat_rate,8) NOT BETWEEN 0 AND 100 OR COALESCE(v_booking.service_fee_rate,5) NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FEE_RATE' USING ERRCODE='22023'; END IF;
  UPDATE public.room_bookings SET status='checked_out',booking_flag_room_status=NULL,actual_check_out=clock_timestamp(),
    check_out_date=COALESCE(p_check_out_date,check_out_date),late_checkout_charge=p_late_checkout_charge,
    service_charges=p_service_charges,subtotal=p_subtotal,damage_charges=p_damage_charges,
    damage_notes=p_damage_notes,damage_items=p_damage_items,total_amount=total_amount
    WHERE id=p_booking_id RETURNING * INTO v_after;
  v_source:=public.transition_room_status(p_room_id,'vacant_dirty','Trả phòng',NULL,NULL,false,v_command);
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'checkout',v_booking.status,'checked_out',NULL,jsonb_build_object('command_id',v_command,'room_id',p_room_id));
  -- Read values produced by calculate_payment_status, including zero-subtotal
  -- derivation. Do not return a different financial quote from the persisted row.
  RETURN private.save_booking_room_command(v_command,'checkout',ARRAY[p_booking_id],ARRAY[p_room_id],v_request,
    jsonb_build_object('success',true,'booking_id',p_booking_id,'room_id',p_room_id,
      'payment_status',v_after.payment_status,'subtotal',v_after.subtotal,
      'vat_base',GREATEST(COALESCE(v_after.subtotal,0)-COALESCE(v_after.damage_charges,0),0),
      'vat_amount',v_after.vat_amount,'service_fee_amount',v_after.service_fee_amount,
      'total_amount',v_after.total_amount,'damage_charges',v_after.damage_charges,
      'workflow_event_id',v_source->'workflow_event_id','room_transition',v_source));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.transfer_booking_room(p_booking_id uuid,p_new_room_id uuid,p_reason text DEFAULT NULL,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE; v_target public.rooms%ROWTYPE;
  v_command uuid:=COALESCE(p_command_id,gen_random_uuid()); v_request jsonb; v_result jsonb;
  v_old_source jsonb; v_new_source jsonb; v_start timestamptz; v_end timestamptz;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_new_room_id IS NULL OR COALESCE(length(p_reason),0)>4000 THEN
    RAISE EXCEPTION 'INVALID_TRANSFER_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('booking_id',p_booking_id,'new_room_id',p_new_room_id,'reason',p_reason);
  v_result:=private.replay_booking_room_command(v_command,'transfer',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_new_room_id=v_booking.room_id THEN RAISE EXCEPTION 'SAME_ROOM' USING ERRCODE='PT409'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[v_booking.room_id,p_new_room_id]);
  SELECT * INTO v_target FROM public.rooms WHERE id=p_new_room_id;
  IF v_target.hotel_id IS DISTINCT FROM v_booking.hotel_id OR NOT EXISTS(SELECT 1 FROM public.rooms
    WHERE id=v_booking.room_id AND tenant_id=v_booking.tenant_id AND hotel_id=v_booking.hotel_id) THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF v_booking.status NOT IN('confirmed','checked_in') THEN
    RAISE EXCEPTION 'INVALID_BOOKING_STATUS' USING ERRCODE='PT409'; END IF;
  IF v_target.status IN('out_of_service','out_of_order') OR (v_booking.status='checked_in'
    AND v_target.status NOT IN('vacant_clean','vacant_inspected')) THEN
    RAISE EXCEPTION 'NEW_ROOM_UNAVAILABLE' USING ERRCODE='PT409'; END IF;
  v_start:=CASE WHEN v_booking.booking_type='hourly' THEN v_booking.hourly_start_time ELSE v_booking.check_in_date::timestamptz END;
  v_end:=CASE WHEN v_booking.booking_type='hourly' THEN v_booking.hourly_end_time ELSE v_booking.check_out_date::timestamptz END;
  IF v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN
    RAISE EXCEPTION 'INVALID_BOOKING_INTERVAL' USING ERRCODE='22023'; END IF;
  -- Mixed daily/hourly bookings participate in the same conflict check. Daily
  -- date boundaries retain the database timezone semantics of the existing API.
  IF EXISTS(SELECT 1 FROM public.room_bookings rb WHERE rb.room_id=p_new_room_id AND rb.id<>p_booking_id
    AND rb.status IN('confirmed','checked_in','sleep_out','skipper') AND (
      (CASE WHEN rb.booking_type='hourly' THEN rb.hourly_start_time ELSE rb.check_in_date::timestamptz END)<v_end
      AND (CASE WHEN rb.booking_type='hourly' THEN rb.hourly_end_time ELSE rb.check_out_date::timestamptz END)>v_start
      OR (v_booking.status='checked_in' AND rb.status IN('checked_in','sleep_out','skipper')))) THEN
    RAISE EXCEPTION 'NEW_ROOM_HAS_CONFLICT' USING ERRCODE='PT409'; END IF;
  UPDATE public.room_bookings SET room_id=p_new_room_id,notes=concat_ws(E'\n',NULLIF(notes,''),
    '[Chuyển phòng'||CASE WHEN NULLIF(trim(p_reason),'') IS NULL THEN '' ELSE ': '||trim(p_reason) END||']') WHERE id=p_booking_id;
  IF v_booking.status='checked_in' THEN
    v_old_source:=public.transition_room_status(v_booking.room_id,'vacant_dirty','Chuyển khách sang phòng khác',NULL,NULL,false,gen_random_uuid());
    v_new_source:=public.transition_room_status(p_new_room_id,'occupied_clean','Tiếp nhận khách chuyển sang',NULL,NULL,false,gen_random_uuid());
  END IF;
  PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
    'room_transfer',v_booking.room_id::text,p_new_room_id::text,NULL,
    jsonb_build_object('reason',p_reason,'command_id',v_command,'from_room',v_booking.room_id,'to_room',p_new_room_id));
  RETURN private.save_booking_room_command(v_command,'transfer',ARRAY[p_booking_id],ARRAY[v_booking.room_id,p_new_room_id],v_request,
    jsonb_build_object('success',true,'booking_id',p_booking_id,'from_room_id',v_booking.room_id,'to_room_id',p_new_room_id,
      'room_transitions',jsonb_build_array(v_old_source,v_new_source)));
END;
$fn$;

-- Former private bodies remain forwarding compatibility only. They cannot retain
-- a second checkout/checkin implementation with older occupancy rules.
CREATE OR REPLACE FUNCTION private.perform_checkin_without_notes_v1(p_booking_id uuid,p_room_id uuid,p_early_checkin_charge numeric DEFAULT 0,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.perform_checkin(p_booking_id,p_room_id,p_early_checkin_charge,p_command_id,NULL);
$fn$;
REVOKE ALL ON FUNCTION private.perform_checkin_without_notes_v1(uuid,uuid,numeric,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.perform_checkout_without_notes_v1(p_booking_id uuid,p_room_id uuid,p_late_checkout_charge numeric DEFAULT 0,
 p_service_charges numeric DEFAULT 0,p_subtotal numeric DEFAULT 0,p_damage_charges numeric DEFAULT 0,p_damage_notes text DEFAULT NULL,
 p_damage_items jsonb DEFAULT '[]',p_new_amount_paid numeric DEFAULT NULL,p_check_out_date date DEFAULT NULL,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT public.perform_checkout(p_booking_id,p_room_id,p_late_checkout_charge,p_service_charges,p_subtotal,p_damage_charges,
   p_damage_notes,p_damage_items,p_new_amount_paid,p_check_out_date,p_command_id,NULL);
$fn$;
REVOKE ALL ON FUNCTION private.perform_checkout_without_notes_v1(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Extend the existing terminal-cancellation protocol without weakening any old
-- request validator or changing the old command payloads.
ALTER FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) SET SCHEMA private;
ALTER FUNCTION private.cancel_booking_room_command(uuid,text,jsonb) RENAME TO cancel_booking_room_without_flags_v1;
REVOKE ALL ON FUNCTION private.cancel_booking_room_without_flags_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.cancel_booking_room_command(p_command_id uuid,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;v_request jsonb;v_result jsonb;
BEGIN
  IF p_operation IS DISTINCT FROM 'booking_flag' THEN
    RETURN private.cancel_booking_room_without_flags_v1(p_command_id,p_operation,p_request);
  END IF;
  v_actor:=private.lock_booking_operation_actor();
  IF p_command_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object'
    OR NOT(p_request ?& ARRAY['booking_id','to_status','reason','amount_owed'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>4
    OR jsonb_typeof(p_request->'reason') NOT IN('string','null')
    OR jsonb_typeof(p_request->'amount_owed') NOT IN('number','null') THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FLAG_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=private.booking_flag_request((p_request->>'booking_id')::uuid,p_request->>'to_status',
    p_request->>'reason',(p_request->>'amount_owed')::numeric);
  IF v_request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'INVALID_BOOKING_FLAG_INPUT' USING ERRCODE='22023'; END IF;
  v_result:=private.replay_booking_room_command(p_command_id,'booking_flag',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=(v_request->>'booking_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[v_booking.id],ARRAY[v_booking.room_id]);
  RETURN private.save_booking_room_command(p_command_id,'booking_flag',ARRAY[v_booking.id],ARRAY[v_booking.room_id],v_request,
    jsonb_build_object('state','cancelled','success',false,'tenant_id',v_actor.tenant_id,
      'booking_ids',ARRAY[v_booking.id],'room_ids',ARRAY[v_booking.room_id],'changed',false,'workflow_event_id',NULL));
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) TO authenticated;

