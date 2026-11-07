-- Q02 booking operations: live capability/scope, normal room transitions and
-- booking + money + canonical room source + audit + durable result atomically.
CREATE TABLE private.booking_room_commands (
  actor_id uuid NOT NULL,
  command_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN ('transfer','checkin','checkout','group_checkout')),
  tenant_id uuid NOT NULL,
  booking_ids uuid[] NOT NULL CHECK(cardinality(booking_ids) BETWEEN 1 AND 100),
  room_ids uuid[] NOT NULL CHECK(cardinality(room_ids) BETWEEN 1 AND 100),
  session_id uuid NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,command_id)
);
ALTER TABLE private.booking_room_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_room_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_booking_operation_actor()
RETURNS public.users LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;
BEGIN
  v_actor:=private.lock_workflow_delivery_actor();
  PERFORM 1 FROM public.user_permissions WHERE user_id=v_actor.id ORDER BY id FOR SHARE;
  PERFORM 1 FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE r.code=v_actor.role::text AND (r.tenant_id=v_actor.tenant_id
      OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid)
      AND p.module='bookings' AND p.action IN('update','edit','manage')
    ORDER BY r.id,p.id FOR SHARE OF rp,r,p;
  IF NOT(public.has_user_permission(v_actor.id,'bookings','update')
    OR public.has_user_permission(v_actor.id,'bookings','manage')) THEN
    RAISE EXCEPTION 'BOOKING_OPERATION_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
  PERFORM private.assert_room_transition_session();
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_booking_operation_actor() FROM PUBLIC,anon,authenticated,service_role;

-- Caller already holds actor/capability and command locks. Group operations
-- lock every booking, then every room, then every hotel in the same ID order.
CREATE FUNCTION private.lock_booking_operation_scope(p_booking_ids uuid[],p_room_ids uuid[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_hotels uuid[]; v_count integer;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id=auth.uid();
  IF cardinality(p_booking_ids) NOT BETWEEN 1 AND 100 OR cardinality(p_room_ids) NOT BETWEEN 1 AND 100
    OR p_booking_ids IS NULL OR p_room_ids IS NULL THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.room_bookings WHERE id=ANY(p_booking_ids) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(p_booking_ids) OR EXISTS(SELECT 1 FROM public.room_bookings
    WHERE id=ANY(p_booking_ids) AND tenant_id IS DISTINCT FROM v_actor.tenant_id) THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.rooms WHERE id=ANY(p_room_ids) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(p_room_ids) OR EXISTS(SELECT 1 FROM public.rooms
    WHERE id=ANY(p_room_ids) AND tenant_id IS DISTINCT FROM v_actor.tenant_id) THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  SELECT array_agg(DISTINCT hotel_id ORDER BY hotel_id) INTO v_hotels FROM (
    SELECT hotel_id FROM public.room_bookings WHERE id=ANY(p_booking_ids)
    UNION SELECT hotel_id FROM public.rooms WHERE id=ANY(p_room_ids)) h;
  PERFORM 1 FROM public.hotels WHERE id=ANY(v_hotels) ORDER BY id FOR SHARE;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(v_hotels) OR EXISTS(SELECT 1 FROM public.hotels h WHERE h.id=ANY(v_hotels)
    AND (h.tenant_id IS DISTINCT FROM v_actor.tenant_id OR h.status IS DISTINCT FROM 'active'
      OR (v_actor.role::text<>'owner' AND NOT EXISTS(SELECT 1 FROM public.user_hotels uh
        WHERE uh.user_id=v_actor.id AND uh.hotel_id=h.id)))) THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.assert_room_transition_session();
END;
$fn$;
REVOKE ALL ON FUNCTION private.lock_booking_operation_scope(uuid[],uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.replay_booking_room_command(p_command_id uuid,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_saved private.booking_room_commands%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_command_id::text,0));
  SELECT * INTO v_saved FROM private.booking_room_commands WHERE actor_id=auth.uid() AND command_id=p_command_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_saved.operation IS DISTINCT FROM p_operation OR v_saved.request IS DISTINCT FROM p_request THEN
    RAISE EXCEPTION 'BOOKING_COMMAND_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF v_saved.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.users WHERE id=auth.uid()) THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(v_saved.booking_ids,v_saved.room_ids);
  RETURN v_saved.result||jsonb_build_object('replayed',true);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_booking_room_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.save_booking_room_command(p_command_id uuid,p_operation text,p_booking_ids uuid[],p_room_ids uuid[],p_request jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_result jsonb:=p_result||jsonb_build_object('command_id',p_command_id,'operation',p_operation,'replayed',false);
BEGIN
  INSERT INTO private.booking_room_commands(actor_id,command_id,operation,tenant_id,booking_ids,room_ids,session_id,request,result)
  VALUES(auth.uid(),p_command_id,p_operation,(SELECT tenant_id FROM public.users WHERE id=auth.uid()),
    p_booking_ids,p_room_ids,(auth.jwt()->>'session_id')::uuid,p_request,v_result);
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.save_booking_room_command(uuid,text,uuid[],uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.transfer_booking_room(uuid,uuid,text) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.transfer_booking_room(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.transfer_booking_room(p_booking_id uuid,p_new_room_id uuid,p_reason text DEFAULT NULL,p_command_id uuid DEFAULT NULL)
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
    AND rb.status IN('confirmed','checked_in') AND (
      (CASE WHEN rb.booking_type='hourly' THEN rb.hourly_start_time ELSE rb.check_in_date::timestamptz END)<v_end
      AND (CASE WHEN rb.booking_type='hourly' THEN rb.hourly_end_time ELSE rb.check_out_date::timestamptz END)>v_start
      OR (v_booking.status='checked_in' AND rb.status='checked_in'))) THEN
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
REVOKE ALL ON FUNCTION public.transfer_booking_room(uuid,uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.transfer_booking_room(uuid,uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.transfer_booking_room(p_booking_id uuid,p_new_room_id uuid,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.transfer_booking_room(p_booking_id,p_new_room_id,p_reason,NULL);
$fn$;

ALTER FUNCTION public.perform_checkin(uuid,uuid,numeric) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.perform_checkin(uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.perform_checkin(p_booking_id uuid,p_room_id uuid,p_early_checkin_charge numeric DEFAULT 0,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_booking public.room_bookings%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_command uuid:=COALESCE(p_command_id,gen_random_uuid()); v_request jsonb; v_result jsonb; v_source jsonb; v_now timestamptz;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_booking_id IS NULL OR p_room_id IS NULL OR p_early_checkin_charge IS NULL OR p_early_checkin_charge<0
    OR p_early_checkin_charge::text IN('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'INVALID_CHECKIN_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=jsonb_build_object('booking_id',p_booking_id,'room_id',p_room_id,'early_checkin_charge',p_early_checkin_charge);
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
  IF EXISTS(SELECT 1 FROM public.room_bookings WHERE room_id=p_room_id AND id<>p_booking_id AND status='checked_in') THEN
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
REVOKE ALL ON FUNCTION public.perform_checkin(uuid,uuid,numeric,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perform_checkin(uuid,uuid,numeric,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.perform_checkin(p_booking_id uuid,p_room_id uuid,p_early_checkin_charge numeric DEFAULT 0)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.perform_checkin(p_booking_id,p_room_id,p_early_checkin_charge,NULL);
$fn$;

ALTER FUNCTION public.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.perform_checkout(p_booking_id uuid,p_room_id uuid,p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,p_subtotal numeric DEFAULT 0,p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,p_damage_items jsonb DEFAULT '[]',p_new_amount_paid numeric DEFAULT NULL,
  p_check_out_date date DEFAULT NULL,p_command_id uuid DEFAULT NULL)
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
  v_result:=private.replay_booking_room_command(v_command,'checkout',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[p_room_id]);
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id;
  SELECT * INTO v_room FROM public.rooms WHERE id=p_room_id;
  IF v_booking.room_id IS DISTINCT FROM p_room_id OR v_booking.hotel_id IS DISTINCT FROM v_room.hotel_id THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  IF v_booking.status IS DISTINCT FROM 'checked_in' THEN RAISE EXCEPTION 'BOOKING_NOT_CHECKED_IN' USING ERRCODE='PT409'; END IF;
  IF v_room.status NOT IN('occupied_clean','occupied_dirty','dnd','service_refused','sleep_out','skipper') THEN
    RAISE EXCEPTION 'ROOM_NOT_OCCUPIED' USING ERRCODE='PT409'; END IF;
  IF p_check_out_date IS NOT NULL AND (p_check_out_date<v_booking.check_in_date OR p_check_out_date>current_date) THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_DATE' USING ERRCODE='22023'; END IF;
  IF COALESCE(v_booking.vat_rate,8) NOT BETWEEN 0 AND 100 OR COALESCE(v_booking.service_fee_rate,5) NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'INVALID_BOOKING_FEE_RATE' USING ERRCODE='22023'; END IF;
  UPDATE public.room_bookings SET status='checked_out',actual_check_out=clock_timestamp(),
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
REVOKE ALL ON FUNCTION public.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perform_checkout(uuid,uuid,numeric,numeric,numeric,numeric,text,jsonb,numeric,date,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.perform_checkout(p_booking_id uuid,p_room_id uuid,p_late_checkout_charge numeric DEFAULT 0,
  p_service_charges numeric DEFAULT 0,p_subtotal numeric DEFAULT 0,p_damage_charges numeric DEFAULT 0,
  p_damage_notes text DEFAULT NULL,p_damage_items jsonb DEFAULT '[]',p_new_amount_paid numeric DEFAULT NULL,p_check_out_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.perform_checkout(p_booking_id,p_room_id,p_late_checkout_charge,p_service_charges,p_subtotal,
    p_damage_charges,p_damage_notes,p_damage_items,p_new_amount_paid,p_check_out_date,NULL);
$fn$;

ALTER FUNCTION public.perform_group_checkout(jsonb) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.perform_group_checkout(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.perform_group_checkout(p_checkouts jsonb,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_command uuid:=COALESCE(p_command_id,gen_random_uuid());
  v_item jsonb; v_request jsonb; v_result jsonb; v_results jsonb:='[]'; v_bookings uuid[]; v_rooms uuid[];
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  IF p_checkouts IS NULL OR jsonb_typeof(p_checkouts)<>'array' THEN
    RAISE EXCEPTION 'CHECKOUT_ITEMS_REQUIRED' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_checkouts) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_ITEMS' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_checkouts) LOOP
    PERFORM private.validate_checkout_item(v_item,true);
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_checkouts) x(item)
    GROUP BY (item->>'booking_id')::uuid HAVING count(*)>1) THEN
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_BOOKING' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('checkouts',jsonb_agg(item ORDER BY item->>'booking_id')),
    array_agg((item->>'booking_id')::uuid ORDER BY item->>'booking_id'),
    array_agg(DISTINCT (item->>'room_id')::uuid ORDER BY (item->>'room_id')::uuid)
    INTO v_request,v_bookings,v_rooms FROM jsonb_array_elements(p_checkouts) x(item);
  v_result:=private.replay_booking_room_command(v_command,'group_checkout',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM private.lock_booking_operation_scope(v_bookings,v_rooms);
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_request->'checkouts') LOOP
    v_results:=v_results||jsonb_build_array(public.perform_checkout((v_item->>'booking_id')::uuid,(v_item->>'room_id')::uuid,
      COALESCE(NULLIF(v_item->>'late_checkout_charge',''),'0')::numeric,COALESCE(NULLIF(v_item->>'service_charges',''),'0')::numeric,
      (v_item->>'subtotal')::numeric,(v_item->>'damage_charges')::numeric,NULLIF(v_item->>'damage_notes',''),
      COALESCE(v_item->'damage_items','[]'),NULL,NULLIF(v_item->>'check_out_date','')::date,gen_random_uuid()));
  END LOOP;
  RETURN private.save_booking_room_command(v_command,'group_checkout',v_bookings,v_rooms,v_request,
    jsonb_build_object('success',true,'booking_count',cardinality(v_bookings),'results',v_results));
END;
$fn$;
REVOKE ALL ON FUNCTION public.perform_group_checkout(jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perform_group_checkout(jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.perform_group_checkout(p_checkouts jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT public.perform_group_checkout(p_checkouts,NULL);
$fn$;

CREATE FUNCTION public.get_booking_room_command_result(p_command_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE; v_saved private.booking_room_commands%ROWTYPE;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor.id::text||':'||p_command_id::text,0));
  SELECT * INTO v_saved FROM private.booking_room_commands WHERE actor_id=v_actor.id AND command_id=p_command_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_saved.tenant_id IS DISTINCT FROM v_actor.tenant_id THEN
    RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(v_saved.booking_ids,v_saved.room_ids);
  RETURN v_saved.result||jsonb_build_object('replayed',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_booking_room_command_result(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_booking_room_command_result(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
