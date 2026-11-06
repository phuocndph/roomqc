-- RW5: retaining a deposit classifies money already received. It is never a
-- second cash receipt. This immutable snapshot also records an obligation to
-- refund; it does not claim that an external refund has been executed.
CREATE TABLE private.booking_no_show_resolutions (
  booking_id uuid PRIMARY KEY,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  room_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  command_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN('retain','refund_due')),
  deposit_amount numeric NOT NULL CHECK(deposit_amount>=0 AND deposit_amount::text NOT IN('NaN','Infinity','-Infinity')),
  amount_paid numeric NOT NULL CHECK(amount_paid>=0 AND amount_paid::text NOT IN('NaN','Infinity','-Infinity')),
  retained_amount numeric NOT NULL CHECK(retained_amount>=0),
  refund_due_amount numeric NOT NULL CHECK(refund_due_amount>=0),
  cash_movement numeric NOT NULL DEFAULT 0 CHECK(cash_movement=0),
  request jsonb NOT NULL,
  booking_snapshot jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(retained_amount+refund_due_amount=deposit_amount
    AND ((decision='retain' AND refund_due_amount=0) OR (decision='refund_due' AND retained_amount=0)))
);
COMMENT ON TABLE private.booking_no_show_resolutions IS
  'Immutable no-show deposit classification, not a payment or an executed refund; booking snapshot retained for command recovery.';
ALTER TABLE private.booking_no_show_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_no_show_resolutions FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE private.booking_room_commands DROP CONSTRAINT booking_room_commands_operation_check;
ALTER TABLE private.booking_room_commands ADD CONSTRAINT booking_room_commands_operation_check
  CHECK(operation IN('transfer','checkin','checkout','group_checkout','booking_flag','no_show'));

CREATE FUNCTION private.booking_no_show_request(p_booking_id uuid,p_refund_deposit boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF p_booking_id IS NULL OR p_refund_deposit IS NULL OR COALESCE(length(p_reason),0)>4000 THEN
    RAISE EXCEPTION 'INVALID_NO_SHOW_INPUT' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('booking_id',p_booking_id,'refund_deposit',p_refund_deposit,'reason',p_reason);
END;
$fn$;
REVOKE ALL ON FUNCTION private.booking_no_show_request(uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.resolve_booking_no_show(p_booking_id uuid,p_refund_deposit boolean DEFAULT true,
  p_reason text DEFAULT NULL,p_command_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;
  v_saved private.booking_no_show_resolutions%ROWTYPE;v_command uuid:=COALESCE(p_command_id,gen_random_uuid());
  v_request jsonb;v_result jsonb;v_now timestamptz;v_already_resolved boolean:=false;
BEGIN
  v_actor:=private.lock_booking_operation_actor();
  v_request:=private.booking_no_show_request(p_booking_id,p_refund_deposit,p_reason);
  v_result:=private.replay_booking_room_command(v_command,'no_show',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[v_booking.room_id]);
  IF NOT EXISTS(SELECT 1 FROM public.rooms r WHERE r.id=v_booking.room_id AND r.hotel_id=v_booking.hotel_id) THEN
    RAISE EXCEPTION 'BOOKING_ROOM_MISMATCH' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_saved FROM private.booking_no_show_resolutions WHERE booking_id=p_booking_id;
  IF FOUND THEN
    -- Different actor/key can observe the same business outcome, never change
    -- the original financial decision or manufacture a second fee.
    IF v_booking.status<>'no_show' OR v_saved.tenant_id IS DISTINCT FROM v_booking.tenant_id
      OR v_saved.hotel_id IS DISTINCT FROM v_booking.hotel_id OR v_saved.room_id IS DISTINCT FROM v_booking.room_id
      OR v_saved.request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'NO_SHOW_RESOLUTION_CONFLICT' USING ERRCODE='PT409'; END IF;
    v_already_resolved:=true;
  ELSE
    IF v_booking.status='no_show' THEN
      RAISE EXCEPTION 'NO_SHOW_LEGACY_REQUIRES_RECONCILIATION' USING ERRCODE='PT409'; END IF;
    IF v_booking.status<>'confirmed' THEN
      RAISE EXCEPTION 'INVALID_BOOKING_STATUS_FOR_NO_SHOW' USING ERRCODE='PT409'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.v_overdue_checkins WHERE id=p_booking_id AND hours_overdue>0) THEN
      RAISE EXCEPTION 'NOT_OVERDUE' USING ERRCODE='PT409'; END IF;
    IF COALESCE(v_booking.deposit_amount,0)<0 OR COALESCE(v_booking.amount_paid,0)<0
      OR v_booking.deposit_amount::text IN('NaN','Infinity','-Infinity')
      OR v_booking.amount_paid::text IN('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'NO_SHOW_MONEY_REQUIRES_RECONCILIATION' USING ERRCODE='PT409'; END IF;
    v_now:=clock_timestamp();
    -- No room mutation: a reservation stops blocking availability, but another
    -- occupied stay, room cleanliness and maintenance state remain untouched.
    UPDATE public.room_bookings SET status='no_show',updated_at=v_now WHERE id=p_booking_id RETURNING * INTO v_booking;
    INSERT INTO private.booking_no_show_resolutions(booking_id,tenant_id,hotel_id,room_id,actor_id,session_id,
      command_id,decision,deposit_amount,amount_paid,retained_amount,refund_due_amount,request,booking_snapshot,recorded_at)
    VALUES(p_booking_id,v_booking.tenant_id,v_booking.hotel_id,v_booking.room_id,v_actor.id,(auth.jwt()->>'session_id')::uuid,
      v_command,CASE WHEN p_refund_deposit THEN 'refund_due' ELSE 'retain' END,
      COALESCE(v_booking.deposit_amount,0),COALESCE(v_booking.amount_paid,0),
      CASE WHEN p_refund_deposit THEN 0 ELSE COALESCE(v_booking.deposit_amount,0) END,
      CASE WHEN p_refund_deposit THEN COALESCE(v_booking.deposit_amount,0) ELSE 0 END,
      v_request,to_jsonb(v_booking),v_now) RETURNING * INTO v_saved;
    PERFORM public.log_state_transition(v_booking.tenant_id,v_booking.hotel_id,'room_bookings',p_booking_id,
      'booking_transition','confirmed','no_show',p_reason,
      jsonb_build_object('command_id',v_command,'resolution_id',v_saved.id,'cash_movement',0,
        'retained_amount',v_saved.retained_amount,'refund_due_amount',v_saved.refund_due_amount));
  END IF;
  v_result:=jsonb_build_object('success',true,'tenant_id',v_saved.tenant_id,'hotel_id',v_saved.hotel_id,
    'booking_id',p_booking_id,'room_id',v_saved.room_id,'previous_status','confirmed','status','no_show',
    'booking',v_saved.booking_snapshot,'already_resolved',v_already_resolved,'room_status_changed',false,
    'workflow_event_id',NULL,'deposit_resolution',jsonb_build_object('id',v_saved.id,'decision',v_saved.decision,
      'deposit_amount',v_saved.deposit_amount,'amount_paid',v_saved.amount_paid,'retained_amount',v_saved.retained_amount,
      'refund_due_amount',v_saved.refund_due_amount,'cash_movement',v_saved.cash_movement,'recorded_at',v_saved.recorded_at));
  RETURN private.save_booking_room_command(v_command,'no_show',ARRAY[p_booking_id],ARRAY[v_saved.room_id],v_request,v_result);
END;
$fn$;
REVOKE ALL ON FUNCTION public.resolve_booking_no_show(uuid,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resolve_booking_no_show(uuid,boolean,text,uuid) TO authenticated;

-- Stable legacy intent per booking and actor. MD5 constructs an opaque UUID;
-- authorization still comes exclusively from live actor and scope checks.
CREATE OR REPLACE FUNCTION public.mark_booking_no_show(_booking_id uuid,_reason text DEFAULT NULL,_refund_deposit boolean DEFAULT true)
RETURNS public.room_bookings LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.resolve_booking_no_show(_booking_id,_refund_deposit,_reason,
    md5('roomqc:legacy-no-show:'||_booking_id::text)::uuid);
  IF v_result->>'state'='cancelled' THEN
    RAISE EXCEPTION 'BOOKING_COMMAND_CANCELLED' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_populate_record(NULL::public.room_bookings,v_result->'booking');
END;
$fn$;
REVOKE ALL ON FUNCTION public.mark_booking_no_show(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(uuid,text,boolean) TO authenticated;

ALTER FUNCTION public.transition_booking_status(uuid,text,text,numeric) SET SCHEMA private;
ALTER FUNCTION private.transition_booking_status(uuid,text,text,numeric) RENAME TO transition_booking_status_before_no_show_v1;
REVOKE ALL ON FUNCTION private.transition_booking_status_before_no_show_v1(uuid,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.transition_booking_status(_booking_id uuid,_to_status text,_reason text DEFAULT NULL,_amount_owed numeric DEFAULT NULL)
RETURNS public.room_bookings LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF _to_status='no_show' THEN
    IF _amount_owed IS NOT NULL THEN RAISE EXCEPTION 'INVALID_NO_SHOW_INPUT' USING ERRCODE='22023'; END IF;
    RETURN public.mark_booking_no_show(_booking_id,_reason,true);
  END IF;
  RETURN private.transition_booking_status_before_no_show_v1(_booking_id,_to_status,_reason,_amount_owed);
END;
$fn$;
REVOKE ALL ON FUNCTION public.transition_booking_status(uuid,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.transition_booking_status(uuid,text,text,numeric) TO authenticated;

ALTER FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) SET SCHEMA private;
ALTER FUNCTION private.cancel_booking_room_command(uuid,text,jsonb) RENAME TO cancel_booking_room_without_no_show_v1;
REVOKE ALL ON FUNCTION private.cancel_booking_room_without_no_show_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.cancel_booking_room_command(p_command_id uuid,p_operation text,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor public.users%ROWTYPE;v_booking public.room_bookings%ROWTYPE;v_request jsonb;v_result jsonb;
BEGIN
  IF p_operation IS DISTINCT FROM 'no_show' THEN
    RETURN private.cancel_booking_room_without_no_show_v1(p_command_id,p_operation,p_request); END IF;
  v_actor:=private.lock_booking_operation_actor();
  IF p_command_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object'
    OR NOT(p_request ?& ARRAY['booking_id','refund_deposit','reason'])
    OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>3
    OR jsonb_typeof(p_request->'refund_deposit')<>'boolean'
    OR jsonb_typeof(p_request->'reason') NOT IN('string','null') THEN
    RAISE EXCEPTION 'INVALID_NO_SHOW_INPUT' USING ERRCODE='22023'; END IF;
  v_request:=private.booking_no_show_request((p_request->>'booking_id')::uuid,(p_request->>'refund_deposit')::boolean,p_request->>'reason');
  IF v_request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'INVALID_NO_SHOW_INPUT' USING ERRCODE='22023'; END IF;
  v_result:=private.replay_booking_room_command(p_command_id,'no_show',v_request);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=(v_request->>'booking_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[v_booking.id],ARRAY[v_booking.room_id]);
  RETURN private.save_booking_room_command(p_command_id,'no_show',ARRAY[v_booking.id],ARRAY[v_booking.room_id],v_request,
    jsonb_build_object('state','cancelled','success',false,'tenant_id',v_actor.tenant_id,
      'booking_ids',ARRAY[v_booking.id],'room_ids',ARRAY[v_booking.room_id],'changed',false,'workflow_event_id',NULL));
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_room_command(uuid,text,jsonb) TO authenticated;

-- Financial decision readback deliberately uses the same live booking-operation
-- authority as the action. It does not grant direct access to the private ledger.
CREATE FUNCTION public.get_booking_no_show_resolution(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_booking public.room_bookings%ROWTYPE;v_result jsonb;
BEGIN
  PERFORM private.lock_booking_operation_actor();
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  PERFORM private.lock_booking_operation_scope(ARRAY[p_booking_id],ARRAY[v_booking.room_id]);
  SELECT jsonb_build_object('booking_id',booking_id,'id',id,'decision',decision,'deposit_amount',deposit_amount,
    'amount_paid',amount_paid,'retained_amount',retained_amount,'refund_due_amount',refund_due_amount,
    'cash_movement',cash_movement,'recorded_at',recorded_at) INTO v_result
    FROM private.booking_no_show_resolutions WHERE booking_id=p_booking_id
      AND tenant_id=v_booking.tenant_id AND hotel_id=v_booking.hotel_id AND room_id=v_booking.room_id;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_booking_no_show_resolution(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_booking_no_show_resolution(uuid) TO authenticated;

-- No-show is financially terminal. Pending bank requests can still be cancelled,
-- but neither a webhook nor a raw writer may apply new money or reopen the stay.
CREATE FUNCTION private.guard_no_show_booking_money()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF OLD.status='no_show' AND (NEW.status IS DISTINCT FROM OLD.status
    OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
    OR NEW.room_id IS DISTINCT FROM OLD.room_id) THEN
    RAISE EXCEPTION 'NO_SHOW_MONEY_REQUIRES_RECONCILIATION' USING ERRCODE='PT409'; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_no_show_booking_money() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_no_show_booking_money BEFORE UPDATE OF status,deposit_amount,amount_paid,tenant_id,hotel_id,room_id ON public.room_bookings
  FOR EACH ROW EXECUTE FUNCTION private.guard_no_show_booking_money();

CREATE FUNCTION private.guard_no_show_payment_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_status text;v_new_movement boolean:=true;
BEGIN
  IF NEW.payment_method NOT IN('cash','bank_transfer') OR NEW.payment_status='cancelled' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    v_new_movement:=OLD.payment_status<>'completed' OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method;
  END IF;
  IF NOT v_new_movement THEN RETURN NEW; END IF;
  -- Shares the payment->booking order of settlement. The no-show operation
  -- locks bookings but never payment rows, so it adds no reverse lock edge.
  SELECT status INTO v_status FROM public.room_bookings WHERE id=NEW.booking_id FOR SHARE;
  IF v_status='no_show' THEN
    RAISE EXCEPTION 'NO_SHOW_MONEY_REQUIRES_RECONCILIATION' USING ERRCODE='PT409'; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_no_show_payment_entry() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_no_show_payment_entry BEFORE INSERT OR UPDATE OF booking_id,amount,payment_method,payment_status
  ON public.booking_payments FOR EACH ROW EXECUTE FUNCTION private.guard_no_show_payment_entry();
