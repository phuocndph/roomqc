-- Materialize the receipt within the checkout transaction. No browser or
-- background JWT is required and a failed insert rolls back the whole core.
-- Existing invoices are retained; no backfill, renumbering or destructive dedup.
ALTER TABLE public.guest_invoices
  ADD COLUMN checkout_actor_id uuid,
  ADD COLUMN checkout_command_id uuid,
  ADD COLUMN checkout_snapshot jsonb,
  ADD CONSTRAINT guest_invoice_checkout_source_pair CHECK (
    (checkout_actor_id IS NULL AND checkout_command_id IS NULL AND checkout_snapshot IS NULL)
    OR (checkout_actor_id IS NOT NULL AND checkout_command_id IS NOT NULL
      AND checkout_snapshot IS NOT NULL AND jsonb_typeof(checkout_snapshot)='object')),
  ADD CONSTRAINT guest_invoice_checkout_source_fk FOREIGN KEY(checkout_actor_id,checkout_command_id)
    REFERENCES private.booking_room_commands(actor_id,command_id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX guest_invoices_one_checkout_receipt
  ON public.guest_invoices(tenant_id,booking_id) WHERE checkout_command_id IS NOT NULL;
CREATE INDEX guest_invoices_checkout_source_lookup
  ON public.guest_invoices(checkout_actor_id,checkout_command_id) WHERE checkout_command_id IS NOT NULL;
CREATE INDEX guest_invoices_booking_receipt_lookup
  ON public.guest_invoices(tenant_id,hotel_id,booking_id,invoice_type,created_at DESC) WHERE booking_id IS NOT NULL;
CREATE SEQUENCE private.checkout_invoice_numbers AS bigint NO CYCLE;
REVOKE ALL ON SEQUENCE private.checkout_invoice_numbers FROM PUBLIC,anon,authenticated,service_role;

-- This invoker trigger also runs on direct REST and indirect definer paths.
-- Protect an issued core snapshot even when a legacy RPC bypasses table RLS.
CREATE FUNCTION private.guard_checkout_invoice() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_booking public.room_bookings%ROWTYPE; v_owner name;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.checkout_command_id IS NOT NULL THEN
      RAISE EXCEPTION 'CHECKOUT_INVOICE_IMMUTABLE' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.checkout_command_id IS NOT NULL THEN
    IF (to_jsonb(NEW)-ARRAY['updated_at','email_sent_at','accountant_email','guest_email','company_name','guest_tax_code','guest_address',
        'vat_claim_status','einvoice_issued_at','einvoice_provider','einvoice_pdf_path'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','email_sent_at','accountant_email','guest_email','company_name','guest_tax_code','guest_address',
        'vat_claim_status','einvoice_issued_at','einvoice_provider','einvoice_pdf_path']) THEN
      RAISE EXCEPTION 'CHECKOUT_INVOICE_IMMUTABLE' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.checkout_actor_id IS NOT NULL OR NEW.checkout_command_id IS NOT NULL OR NEW.checkout_snapshot IS NOT NULL THEN
    SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid=TG_RELID;
    IF current_user<>v_owner THEN
      RAISE EXCEPTION 'CHECKOUT_INVOICE_SOURCE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.booking_id IS NOT NULL AND (TG_OP='INSERT' OR
    (NEW.booking_id,NEW.tenant_id,NEW.hotel_id,NEW.invoice_type) IS DISTINCT FROM
    (OLD.booking_id,OLD.tenant_id,OLD.hotel_id,OLD.invoice_type)) THEN
    SELECT * INTO v_booking FROM public.room_bookings WHERE id=NEW.booking_id FOR UPDATE;
    IF NOT FOUND OR (v_booking.tenant_id,v_booking.hotel_id) IS DISTINCT FROM (NEW.tenant_id,NEW.hotel_id) THEN
      RAISE EXCEPTION 'INVOICE_BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
    IF NEW.invoice_type='receipt' AND EXISTS(SELECT 1 FROM public.guest_invoices i
      WHERE i.booking_id=NEW.booking_id AND i.tenant_id=NEW.tenant_id AND i.invoice_type='receipt' AND i.id<>NEW.id) THEN
      RAISE EXCEPTION 'BOOKING_RECEIPT_ALREADY_EXISTS' USING ERRCODE='PT409'; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_checkout_invoice() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_checkout_invoice BEFORE INSERT OR UPDATE OR DELETE ON public.guest_invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_checkout_invoice();

CREATE FUNCTION private.materialize_checkout_invoice(p_booking_id uuid,p_actor_id uuid,p_command_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_booking public.room_bookings%ROWTYPE; v_room public.rooms%ROWTYPE;
  v_id uuid:=gen_random_uuid(); v_number text; v_sequence text; v_lines jsonb:='[]'; v_taxable numeric; v_damage numeric;
BEGIN
  SELECT * INTO v_booking FROM public.room_bookings WHERE id=p_booking_id;
  IF NOT FOUND OR v_booking.status IS DISTINCT FROM 'checked_out' OR p_actor_id IS DISTINCT FROM auth.uid()
    OR v_booking.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.users WHERE id=p_actor_id) THEN
    RAISE EXCEPTION 'CHECKOUT_INVOICE_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_room FROM public.rooms WHERE id=v_booking.room_id;
  IF NOT FOUND OR (v_room.tenant_id,v_room.hotel_id) IS DISTINCT FROM (v_booking.tenant_id,v_booking.hotel_id) THEN
    RAISE EXCEPTION 'INVOICE_BOOKING_SCOPE_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  -- Use the committed quote, never recalculate nights/hours or VAT in JS.
  -- An approved quote may differ from raw component rates; avoid fabricating
  -- an item breakdown that does not add up to its authoritative subtotal.
  v_damage:=COALESCE(v_booking.damage_charges,0);
  v_taxable:=COALESCE(v_booking.subtotal,0)-v_damage;
  IF v_taxable<0 OR v_damage<0 OR v_booking.subtotal IS NULL OR v_booking.total_amount IS NULL
    OR v_booking.total_amount<>v_booking.subtotal+COALESCE(v_booking.vat_amount,0)+COALESCE(v_booking.service_fee_amount,0) THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_INVOICE_TOTALS' USING ERRCODE='22023'; END IF;
  v_lines:=jsonb_build_array(jsonb_build_object('description','Tiền phòng, dịch vụ và phụ thu',
    'quantity',1,'unit_price',v_taxable,'amount',v_taxable));
  IF v_damage>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('description','Phí đền bù thiệt hại',
    'quantity',1,'unit_price',v_damage,'amount',v_damage)); END IF;
  -- A dedicated global sequence and namespace prevent both simultaneous
  -- checkouts and different tenants from generating the same UNIQUE number.
  -- Sequence gaps after rollback are intentional; allocations are not receipts.
  v_sequence:=nextval('private.checkout_invoice_numbers')::text;
  v_number:='RQC-HD-'||to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYYMMDD')||'-'
    ||lpad(v_sequence,GREATEST(12,length(v_sequence)),'0');
  INSERT INTO public.guest_invoices(id,tenant_id,hotel_id,booking_id,invoice_number,guest_name,guest_phone,
    guest_address,room_number,check_in_date,check_out_date,line_items,subtotal,vat_rate,vat_amount,
    service_fee_rate,service_fee_amount,total_amount,deposit_amount,amount_paid,payment_method,status,
    issued_at,created_by,invoice_type,checkout_actor_id,checkout_command_id,checkout_snapshot)
  VALUES(v_id,v_booking.tenant_id,v_booking.hotel_id,v_booking.id,v_number,v_booking.guest_name,v_booking.guest_phone,
    v_booking.guest_address,v_room.room_number,v_booking.check_in_date,v_booking.actual_check_out::date,v_lines,
    v_booking.subtotal,COALESCE(v_booking.vat_rate,8),COALESCE(v_booking.vat_amount,0),COALESCE(v_booking.service_fee_rate,5),
    COALESCE(v_booking.service_fee_amount,0),v_booking.total_amount,COALESCE(v_booking.deposit_amount,0),
    COALESCE(v_booking.amount_paid,0),NULL,'issued',v_booking.actual_check_out,p_actor_id,'receipt',p_actor_id,p_command_id,
    jsonb_build_object('version',1,'booking_type',v_booking.booking_type,'check_in_date',v_booking.check_in_date,
      'check_out_date',v_booking.check_out_date,'actual_check_out',v_booking.actual_check_out,
      'room_price',v_booking.room_price,'early_checkin_charge',v_booking.early_checkin_charge,
      'late_checkout_charge',v_booking.late_checkout_charge,'service_charges',v_booking.service_charges,
      'extra_charges',v_booking.extra_charges,'damage_charges',v_booking.damage_charges,'damage_items',v_booking.damage_items));
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION private.materialize_checkout_invoice(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.save_booking_room_command(p_command_id uuid,p_operation text,p_booking_ids uuid[],
  p_room_ids uuid[],p_request jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_result jsonb:=p_result||jsonb_build_object('command_id',p_command_id,'operation',p_operation,'replayed',false);
  v_invoice uuid;
BEGIN
  IF p_operation='checkout' AND p_result->>'success'='true' AND NOT(p_result ? 'state') THEN
    IF cardinality(p_booking_ids)<>1 THEN RAISE EXCEPTION 'INVALID_CHECKOUT_INVOICE_CONTEXT' USING ERRCODE='22023'; END IF;
    v_invoice:=private.materialize_checkout_invoice(p_booking_ids[1],auth.uid(),p_command_id);
    v_result:=v_result||jsonb_build_object('invoice_id',v_invoice,'invoice_state','issued');
  END IF;
  INSERT INTO private.booking_room_commands(actor_id,command_id,operation,tenant_id,booking_ids,room_ids,session_id,request,result)
  VALUES(auth.uid(),p_command_id,p_operation,(SELECT tenant_id FROM public.users WHERE id=auth.uid()),
    p_booking_ids,p_room_ids,(auth.jwt()->>'session_id')::uuid,p_request,v_result);
  -- Includes any time spent waiting in invoice triggers/index/foreign keys.
  PERFORM private.assert_room_transition_session();
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION private.save_booking_room_command(uuid,text,uuid[],uuid[],jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
